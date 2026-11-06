-- VOCAL.zip: keep every saved version of the user's data in Supabase (append-only history).
--
-- What it does
--   * New table public.vocal_history. Every insert / change / delete of vocal_data (앱 기록), vocal_media (녹음 목록)
--     and vocal_billing_documents (레슨비 정산) is copied there by a trigger. Saves that change nothing are skipped.
--   * Deleted rows are kept (op = 'delete'), so a deletion can always be undone from here.
--   * The current rows are copied once as a starting snapshot (op = 'snapshot').
--   * Size stays bounded: every version for 3 days; then the last version of each hour (up to 30 days); after that
--     the last version of each day. Snapshots and deletions are never thinned.
--   * Users can only read their own history (RLS). Nobody can write, change or delete it through the API.
--
-- What it does NOT do
--   * It never changes or deletes anything in vocal_data, vocal_media or vocal_billing_documents.
--
-- Safe to run more than once (everything is "if not exists" / "or replace"; the snapshot is taken once per row).

create table if not exists public.vocal_history (
 id bigserial primary key,
 user_id uuid not null,
 source text not null check (source in ('vocal_data','vocal_media','vocal_billing_documents')),
 row_id text not null,
 op text not null check (op in ('snapshot','insert','update','delete')),
 data jsonb not null,
 at timestamptz not null default now()
);
create index if not exists vocal_history_user_source_at on public.vocal_history (user_id, source, at desc);
create index if not exists vocal_history_row on public.vocal_history (source, row_id, at desc);
alter table public.vocal_history enable row level security;
revoke all on public.vocal_history from public, anon, authenticated;
grant select on public.vocal_history to authenticated;
drop policy if exists history_read_own on public.vocal_history;
create policy history_read_own on public.vocal_history for select to authenticated using ((select auth.uid()) = user_id);

-- Thinning: every version for 3 days, then the last of each hour up to 30 days, then the last of each day.
create or replace function public.vocal_history_trim(p_user uuid, p_source text) returns integer
language plpgsql security definer set search_path = '' as $$
declare gone integer;
begin
 delete from public.vocal_history h using (
  select id, row_number() over (
    partition by row_id, date_trunc(case when at < now() - interval '30 days' then 'day' else 'hour' end, at)
    order by at desc, id desc) as n
  from public.vocal_history
  where user_id = p_user and source = p_source and op in ('insert', 'update') and at < now() - interval '3 days'
 ) x where h.id = x.id and x.n > 1;
 get diagnostics gone = row_count;
 return gone;
end;
$$;
revoke all on function public.vocal_history_trim(uuid, text) from public, anon, authenticated;

create or replace function public.vocal_history_keep() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
 r jsonb;
 o jsonb;
 uid uuid;
 rid text;
begin
 if tg_op = 'DELETE' then r := to_jsonb(old); else r := to_jsonb(new); end if;
 -- The billing row already carries its previous payload; the history has it as its own version.
 if tg_table_name = 'vocal_billing_documents' then r := r - 'previous_payload' - 'previous_revision'; end if;
 if tg_op = 'UPDATE' then
  o := to_jsonb(old);
  if tg_table_name = 'vocal_billing_documents' then o := o - 'previous_payload' - 'previous_revision'; end if;
  if (o - 'updated_at') = (r - 'updated_at') then return null; end if; -- nothing really changed
 end if;
 uid := nullif(r->>'user_id', '')::uuid;
 if uid is null then return null; end if;
 rid := coalesce(r->>'id', r->>'user_id');
 insert into public.vocal_history (user_id, source, row_id, op, data) values (uid, tg_table_name, rid, lower(tg_op), r);
 -- Now and then, thin old versions of this user's rows (never snapshots or deletions).
 if random() < 0.05 then perform public.vocal_history_trim(uid, tg_table_name); end if;
 return null;
end;
$$;
revoke all on function public.vocal_history_keep() from public, anon, authenticated;

drop trigger if exists vocal_history_keep on public.vocal_data;
create trigger vocal_history_keep after insert or update or delete on public.vocal_data
 for each row execute function public.vocal_history_keep();
drop trigger if exists vocal_history_keep on public.vocal_media;
create trigger vocal_history_keep after insert or update or delete on public.vocal_media
 for each row execute function public.vocal_history_keep();
drop trigger if exists vocal_history_keep on public.vocal_billing_documents;
create trigger vocal_history_keep after insert or update or delete on public.vocal_billing_documents
 for each row execute function public.vocal_history_keep();

-- Starting snapshot of what is there now (once per row).
insert into public.vocal_history (user_id, source, row_id, op, data)
select d.user_id, 'vocal_data', d.user_id::text, 'snapshot', to_jsonb(d) from public.vocal_data d
where d.user_id is not null and not exists (select 1 from public.vocal_history h where h.source = 'vocal_data' and h.op = 'snapshot' and h.row_id = d.user_id::text);
insert into public.vocal_history (user_id, source, row_id, op, data)
select m.user_id, 'vocal_media', m.id::text, 'snapshot', to_jsonb(m) from public.vocal_media m
where m.user_id is not null and not exists (select 1 from public.vocal_history h where h.source = 'vocal_media' and h.op = 'snapshot' and h.row_id = m.id::text);
insert into public.vocal_history (user_id, source, row_id, op, data)
select b.user_id, 'vocal_billing_documents', b.user_id::text, 'snapshot', to_jsonb(b) - 'previous_payload' - 'previous_revision' from public.vocal_billing_documents b
where not exists (select 1 from public.vocal_history h where h.source = 'vocal_billing_documents' and h.op = 'snapshot' and h.row_id = b.user_id::text);

comment on table public.vocal_history is 'VOCAL.zip append-only history of vocal_data, vocal_media and vocal_billing_documents (incl. deletions). Read-only for the owner.';
