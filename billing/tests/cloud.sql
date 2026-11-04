-- Runs against the disposable CI database after sql-setup and the migration.
\set ON_ERROR_STOP on
set role authenticated;
set request.jwt.claim.sub='11111111-1111-4111-8111-111111111111';
do $$
declare p jsonb := jsonb_build_object('schemaVersion',1,'owner','user:'||auth.uid()::text,'revision',0,'passes','[]'::jsonb,'payments','[]'::jsonb,'deductions','[]'::jsonb,'adjustments','[]'::jsonb,'imports','[]'::jsonb,'importRows','[]'::jsonb,'history','[]'::jsonb);
r jsonb;
begin
 r:=public.vocal_billing_save(0,p,'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa');
 if r->>'revision'<>'1' then raise exception 'initial save failed';end if;
 r:=public.vocal_billing_save(0,p,'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa');
 if r->>'revision'<>'1' then raise exception 'idempotent retry failed';end if;
 begin
  perform public.vocal_billing_save(0,p,'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb');
  raise exception 'stale revision was accepted';
 exception when sqlstate 'PT409' then null;end;
 begin
  perform public.vocal_billing_save(1,jsonb_set(p,'{revision}','2'),'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa');
  raise exception 'request ID reuse accepted';
 exception when sqlstate 'PT409' then null;end;
 begin
  perform public.vocal_billing_save(1,jsonb_set(p,'{owner}','"user:22222222-2222-4222-8222-222222222222"'),'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb');
  raise exception 'cross-account owner accepted';
 exception when invalid_parameter_value then null;end;
 begin
  perform public.vocal_billing_save(1,p-'payments','bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb');
  raise exception 'missing collection accepted';
 exception when invalid_parameter_value then null;end;
 r:=public.vocal_billing_save(1,jsonb_set(p,'{revision}','1'),'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb');
 if r->>'revision'<>'2' then raise exception 'revision increment failed';end if;
 if (select previous_revision from public.vocal_billing_documents)<>1 then raise exception 'previous revision missing';end if;
 if (select previous_payload from public.vocal_billing_documents) is distinct from p then raise exception 'previous payload missing';end if;
 begin
  update public.vocal_billing_documents set revision=50;
  raise exception 'direct update accepted';
 exception when insufficient_privilege then null;end;
 begin
  delete from public.vocal_billing_documents;
  raise exception 'direct delete accepted';
 exception when insufficient_privilege then null;end;
end $$;
set request.jwt.claim.sub='22222222-2222-4222-8222-222222222222';
do $$
declare p jsonb:=jsonb_build_object('schemaVersion',1,'owner','user:'||auth.uid()::text,'revision',0,'passes','[]'::jsonb,'payments','[]'::jsonb,'deductions','[]'::jsonb,'adjustments','[]'::jsonb,'imports','[]'::jsonb,'importRows','[]'::jsonb,'history','[]'::jsonb);
begin
 if (select count(*) from public.vocal_billing_documents)<>0 then raise exception 'RLS exposed another user';end if;
 perform public.vocal_billing_save(0,p,'cccccccc-cccc-4ccc-8ccc-cccccccccccc');
 if (select count(*) from public.vocal_billing_documents)<>1 then raise exception 'own row missing';end if;
end $$;
set request.jwt.claim.sub='';
do $$begin
 begin
  perform public.vocal_billing_save(0,'{}','dddddddd-dddd-4ddd-8ddd-dddddddddddd');
  raise exception 'missing auth accepted';
 exception when insufficient_privilege then null;end;
end $$;
reset role;
set role anon;
do $$begin
 begin
  perform public.vocal_billing_save(0,'{}','dddddddd-dddd-4ddd-8ddd-dddddddddddd');
  raise exception 'anon RPC accepted';
 exception when insufficient_privilege then null;end;
 begin
  perform * from public.vocal_billing_documents;
  raise exception 'anon read accepted';
 exception when insufficient_privilege then null;end;
end $$;
reset role;
select 'billing SQL security and revision checks passed' as result;
