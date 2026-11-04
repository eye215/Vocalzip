-- Project B only. No changes to vocal_data, vocal_media, auth or storage.
create table public.vocal_billing_documents (
 user_id uuid primary key references auth.users(id) on delete cascade,
 payload jsonb not null,
 revision bigint not null check (revision between 1 and 9007199254740990),
 updated_at timestamptz not null default now(),
 last_request_id uuid not null,
 previous_payload jsonb,
 previous_revision bigint,
 constraint billing_payload_owner check (payload->>'owner' = 'user:' || user_id::text),
 constraint billing_payload_size check (octet_length(payload::text) <= 10485760)
);
alter table public.vocal_billing_documents enable row level security;
revoke all on public.vocal_billing_documents from public, anon, authenticated;
grant select on public.vocal_billing_documents to authenticated;
create policy billing_read_own on public.vocal_billing_documents
 for select to authenticated using ((select auth.uid()) = user_id);

-- Writes are serialized per account and must match the last observed server revision.
-- SECURITY DEFINER is restricted to this fixed table and auth.uid(); no caller-supplied user ID.
create function public.vocal_billing_save(p_expected_revision bigint,p_payload jsonb,p_request_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
 account_id uuid := auth.uid();
 current_row public.vocal_billing_documents%rowtype;
 field_name text;
begin
 if account_id is null then raise exception using errcode='42501',message='Authentication required'; end if;
 if p_expected_revision is null or p_expected_revision<0 or p_expected_revision>=9007199254740990 or p_request_id is null then
  raise exception using errcode='22023',message='Invalid billing revision/request ID'; end if;
 if p_payload is null or jsonb_typeof(p_payload) is distinct from 'object'
  or p_payload->>'schemaVersion' is distinct from '1'
  or p_payload->>'owner' is distinct from 'user:'||account_id::text
  or jsonb_typeof(p_payload->'revision') is distinct from 'number'
  or octet_length(p_payload::text)>10485760 then
  raise exception using errcode='22023',message='Invalid billing payload'; end if;
 foreach field_name in array array['passes','payments','deductions','adjustments','imports','importRows','history'] loop
  if jsonb_typeof(p_payload->field_name) is distinct from 'array' then
   raise exception using errcode='22023',message='Invalid billing collection'; end if;
 end loop;
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(account_id::text,7142104));
 select * into current_row from public.vocal_billing_documents where user_id=account_id for update;
 if found then
  if current_row.last_request_id=p_request_id then
   if current_row.payload is distinct from p_payload then raise exception using errcode='PT409',message='Request ID already used'; end if;
   return jsonb_build_object('payload',current_row.payload,'revision',current_row.revision,'updated_at',current_row.updated_at,'last_request_id',current_row.last_request_id);
  end if;
  if current_row.revision<>p_expected_revision then raise exception using errcode='PT409',message='Billing revision conflict'; end if;
  update public.vocal_billing_documents set
   previous_payload=payload,previous_revision=revision,payload=p_payload,
   revision=revision+1,updated_at=clock_timestamp(),last_request_id=p_request_id
   where user_id=account_id returning * into current_row;
 else
  if p_expected_revision<>0 then raise exception using errcode='PT409',message='Billing revision conflict'; end if;
  insert into public.vocal_billing_documents(user_id,payload,revision,last_request_id)
   values(account_id,p_payload,1,p_request_id) returning * into current_row;
 end if;
 return jsonb_build_object('payload',current_row.payload,'revision',current_row.revision,'updated_at',current_row.updated_at,'last_request_id',current_row.last_request_id);
end;
$$;
revoke all on function public.vocal_billing_save(bigint,jsonb,uuid) from public, anon, authenticated;
grant execute on function public.vocal_billing_save(bigint,jsonb,uuid) to authenticated;
comment on table public.vocal_billing_documents is 'Isolated VOCAL.zip billing snapshots with optimistic concurrency; never stores Project A data.';
