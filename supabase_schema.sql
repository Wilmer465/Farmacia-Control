create table if not exists public.sync_records (
  table_name text not null,
  record_id text not null,
  data jsonb not null,
  local_updated_at text,
  synced_at timestamptz not null default now(),
  primary key (table_name, record_id)
);

alter table public.sync_records enable row level security;

drop policy if exists "sync_records_select" on public.sync_records;
drop policy if exists "sync_records_insert" on public.sync_records;
drop policy if exists "sync_records_update" on public.sync_records;

create policy "sync_records_select"
on public.sync_records
for select
to anon, authenticated
using (true);

create policy "sync_records_insert"
on public.sync_records
for insert
to anon, authenticated
with check (true);

create policy "sync_records_update"
on public.sync_records
for update
to anon, authenticated
using (true)
with check (true);

grant select, insert, update on public.sync_records to anon, authenticated;
