-- Explicit, account/session-bound lesson deletion. No backfill or batch cleanup on installation.
-- New deletion guards survive old snapshots; historical lesson text is hidden until redacted.
create table if not exists public.vzip_permanent_delete_guards(
 user_id uuid not null references auth.users(id) on delete cascade,
 kind text not null check(kind in ('lesson','charge')),
 entity_id text not null check(length(entity_id) between 1 and 256),
 operation_id text not null check(length(operation_id) between 1 and 128),
 billing_link text not null default '',
 created_at timestamptz not null default now(),
 primary key(user_id,kind,entity_id)
);
alter table public.vzip_permanent_delete_guards enable row level security;
revoke all on public.vzip_permanent_delete_guards from public,anon,authenticated;

create or replace function public.vzip_payload_has_deleted_lesson(p_user uuid,p_payload jsonb)
returns boolean language sql stable security definer set search_path='' as $$
 select exists(
  select 1 from jsonb_array_elements(case when jsonb_typeof(p_payload->'lessons')='array' then p_payload->'lessons' else '[]'::jsonb end) l
  join public.vzip_permanent_delete_guards g on g.user_id=p_user and g.kind='lesson' and g.entity_id=l->>'id'
 );
$$;
revoke all on function public.vzip_payload_has_deleted_lesson(uuid,jsonb) from public,anon,authenticated;

create or replace function public.vzip_redact_deleted_lessons(p_user uuid,p_payload jsonb)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare result jsonb:=p_payload;gone text[];links text[];items jsonb;item jsonb;kept jsonb;first_id text;
begin
 if jsonb_typeof(p_payload) is distinct from 'object' then return p_payload;end if;
 select array_agg(entity_id),array_agg(billing_link) filter(where billing_link<>'') into gone,links
 from public.vzip_permanent_delete_guards where user_id=p_user and kind='lesson';
 if gone is null then return result;end if;
 if jsonb_typeof(result->'lessons')='array' then
  select coalesce(jsonb_agg(v order by n),'[]'::jsonb) into items
   from jsonb_array_elements(result->'lessons') with ordinality r(v,n)
   where not coalesce(v->>'id'=any(gone),false);
  result:=jsonb_set(result,'{lessons}',items);
 end if;
 if jsonb_typeof(result->'assignments')='array' then
  items:='[]'::jsonb;
  for item in select value from jsonb_array_elements(result->'assignments') loop
   if item->>'lessonId'=any(gone) or exists(
    select 1 from jsonb_array_elements_text(case when jsonb_typeof(item->'lessonIds')='array' then item->'lessonIds' else '[]'::jsonb end) id where id=any(gone)
   ) then
    select coalesce(jsonb_agg(to_jsonb(id) order by ord),'[]'::jsonb) into kept from (
     select id,min(n) ord from (
      select value id,ordinality n from jsonb_array_elements_text(case when jsonb_typeof(item->'lessonIds')='array' then item->'lessonIds' else '[]'::jsonb end) with ordinality
      union all select item->>'lessonId',2147483647
     ) x where coalesce(id,'')<>'' and not(id=any(gone)) group by id
    ) ids;
    first_id:=coalesce(kept->>0,'');
    item:=jsonb_set(jsonb_set(item,'{lessonIds}',kept),'{lessonId}',to_jsonb(first_id));
   end if;
   items:=items||jsonb_build_array(item);
  end loop;
  result:=jsonb_set(result,'{assignments}',items);
 end if;
 if jsonb_typeof(result->'deleted') is distinct from 'object' then result:=jsonb_set(result,'{deleted}','{}'::jsonb);end if;
 select coalesce(jsonb_agg(to_jsonb(id)),'[]'::jsonb) into items from (
  select distinct id from (
   select value id from jsonb_array_elements_text(case when jsonb_typeof(result#>'{deleted,lessons}')='array' then result#>'{deleted,lessons}' else '[]'::jsonb end)
   union all select unnest(gone)
  ) ids
 ) unique_ids;
 result:=jsonb_set(result,'{deleted,lessons}',items);
 if links is not null then
  select coalesce(jsonb_agg(to_jsonb(id)),'[]'::jsonb) into items from (
   select distinct id from (
    select value id from jsonb_array_elements_text(case when jsonb_typeof(result#>'{deleted,billingLessonLinks}')='array' then result#>'{deleted,billingLessonLinks}' else '[]'::jsonb end)
    union all select unnest(links)
   ) ids
  ) unique_ids;
  result:=jsonb_set(result,'{deleted,billingLessonLinks}',items);
 end if;
 return result;
end;
$$;
revoke all on function public.vzip_redact_deleted_lessons(uuid,jsonb) from public,anon,authenticated;

create or replace function public.vzip_permanent_delete_guard_write()
returns trigger language plpgsql security definer set search_path='' as $$
declare entry jsonb;
begin
 perform pg_advisory_xact_lock(hashtextextended('vzip-permanent-delete:'||new.user_id::text,0));
 if tg_table_name='vocal_data' then
  new.payload:=public.vzip_redact_deleted_lessons(new.user_id,new.payload);
 else
  for entry in select value from jsonb_array_elements(coalesce(new.payload->'deductions','[]'::jsonb)) loop
   if coalesce(entry->>'voidedAt','')<>'' and coalesce(entry->>'deletionOperationId','')<>'' then
    insert into public.vzip_permanent_delete_guards(user_id,kind,entity_id,operation_id)
     values(new.user_id,'charge',entry->>'id',entry->>'deletionOperationId') on conflict do nothing;
   end if;
  end loop;
  if exists(
   select 1 from jsonb_array_elements(coalesce(new.payload->'deductions','[]'::jsonb)) d
   join public.vzip_permanent_delete_guards g on g.user_id=new.user_id and g.kind='charge' and g.entity_id=d->>'id'
   where coalesce(d->>'voidedAt','')='' or coalesce(d->>'deletionOperationId','')=''
  ) then raise exception 'A lesson-deletion cancellation cannot be restored' using errcode='23514';end if;
 end if;
 return new;
end;
$$;
revoke all on function public.vzip_permanent_delete_guard_write() from public,anon,authenticated;
drop trigger if exists vzip_permanent_delete_guard on public.vocal_data;
create trigger vzip_permanent_delete_guard before insert or update on public.vocal_data
 for each row execute function public.vzip_permanent_delete_guard_write();
drop trigger if exists vzip_permanent_delete_guard on public.vocal_billing_documents;
create trigger vzip_permanent_delete_guard before insert or update on public.vocal_billing_documents
 for each row execute function public.vzip_permanent_delete_guard_write();

-- Never insert a new history copy of a deleted lesson, including on a whole-document delete.
create or replace function public.vzip_redact_lesson_history_write()
returns trigger language plpgsql security definer set search_path='' as $$
begin
 if new.source='vocal_data' and jsonb_typeof(new.data->'payload')='object' then
  new.data:=jsonb_set(new.data,'{payload}',public.vzip_redact_deleted_lessons(new.user_id,new.data->'payload'));
 end if;
 return new;
end;
$$;
revoke all on function public.vzip_redact_lesson_history_write() from public,anon,authenticated;
drop trigger if exists vzip_redact_lesson_history on public.vocal_history;
create trigger vzip_redact_lesson_history before insert or update on public.vocal_history
 for each row execute function public.vzip_redact_lesson_history_write();

-- History rows waiting for bounded cleanup cannot expose deleted text through the API.
create or replace function public.vzip_history_lesson_visible(p_source text,p_data jsonb)
returns boolean language sql stable security definer set search_path='' as $$
 select public.vzip_session_read_allowed() and (p_source<>'vocal_data' or not public.vzip_payload_has_deleted_lesson(auth.uid(),p_data->'payload'));
$$;
revoke all on function public.vzip_history_lesson_visible(text,jsonb) from public,anon;
grant execute on function public.vzip_history_lesson_visible(text,jsonb) to authenticated;
drop policy if exists vzip_history_no_deleted_lessons on public.vocal_history;
create policy vzip_history_no_deleted_lessons on public.vocal_history as restrictive for select to authenticated
 using(public.vzip_history_lesson_visible(source,data));

create or replace function public.vzip_lesson_delete_capabilities()
returns jsonb language plpgsql stable security definer set search_path='' as $$
begin
 perform public.vzip_assert_session();
 return jsonb_build_object('version',1,'lesson_permanent',true,'charge_guard',true);
end;
$$;
revoke all on function public.vzip_lesson_delete_capabilities() from public,anon;
grant execute on function public.vzip_lesson_delete_capabilities() to authenticated;

create or replace function public.vzip_delete_lesson(
 p_lesson_id text,p_operation_id text,p_expected_updated_at timestamptz,p_billing_link text default ''
) returns jsonb language plpgsql security definer set search_path='' as $$
declare uid uuid:=auth.uid();doc public.vocal_data%rowtype;existing boolean;redacted integer;pending boolean;
begin
 perform public.vzip_assert_session();
 if uid is null or length(coalesce(p_lesson_id,'')) not between 1 and 256 or
    length(coalesce(p_operation_id,'')) not between 1 and 128 or length(coalesce(p_billing_link,''))>256
 then raise exception 'Invalid deletion request' using errcode='22023';end if;
 select * into doc from public.vocal_data where user_id=uid for update;
 if not found then raise exception 'Sync the account before deleting a lesson' using errcode='PT409';end if;
 perform pg_advisory_xact_lock(hashtextextended('vzip-permanent-delete:'||uid::text,0));
 select exists(select 1 from public.vzip_permanent_delete_guards where user_id=uid and kind='lesson' and entity_id=p_lesson_id) into existing;
 if not existing then
  if (select count(*) from jsonb_array_elements(case when jsonb_typeof(doc.payload->'lessons')='array' then doc.payload->'lessons' else '[]'::jsonb end) l where l->>'id'=p_lesson_id)<>1 then
   raise exception 'Sync the exact lesson before deleting it' using errcode='PT409';end if;
  if coalesce((select l->>'billingDeductionId' from jsonb_array_elements(doc.payload->'lessons') l where l->>'id'=p_lesson_id),'')<>coalesce(p_billing_link,'') then
   raise exception 'Lesson billing link changed' using errcode='PT409';end if;
  if doc.updated_at is distinct from p_expected_updated_at then raise exception 'Lesson snapshot changed' using errcode='PT409';end if;
  insert into public.vzip_permanent_delete_guards(user_id,kind,entity_id,operation_id,billing_link)
   values(uid,'lesson',p_lesson_id,p_operation_id,coalesce(p_billing_link,''));
  update public.vocal_data set payload=public.vzip_redact_deleted_lessons(uid,payload),
   updated_at=greatest(clock_timestamp(),updated_at+interval '1 millisecond') where user_id=uid;
 end if;
 -- Bounded work; pending history is already unreadable to the account. Replays continue cleanup.
 with chunk as(
  select id from public.vocal_history where user_id=uid and source='vocal_data'
   and public.vzip_payload_has_deleted_lesson(uid,data->'payload')
   order by id limit 100 for update
 )
 update public.vocal_history h set data=jsonb_set(h.data,'{payload}',public.vzip_redact_deleted_lessons(uid,h.data->'payload'))
  from chunk c where h.id=c.id;
 get diagnostics redacted=row_count;
 select exists(select 1 from public.vocal_history where user_id=uid and source='vocal_data'
  and public.vzip_payload_has_deleted_lesson(uid,data->'payload')) into pending;
 return jsonb_build_object('ok',not pending,'pending',pending,'redacted',redacted,'already_deleted',existing);
end;
$$;
revoke all on function public.vzip_delete_lesson(text,text,timestamptz,text) from public,anon;
grant execute on function public.vzip_delete_lesson(text,text,timestamptz,text) to authenticated;

notify pgrst,'reload schema';
