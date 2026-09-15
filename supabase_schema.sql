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
drop policy if exists "sync_records_delete" on public.sync_records;

-- SEGURIDAD: solo service_role opera sobre sync_records. El rol anon NO tiene
-- acceso: la app desktop usa la service key SOLO en el proceso main (nunca en
-- el renderer). Revocar cualquier grant previo a anon/authenticated.
revoke all on public.sync_records from anon, authenticated;

create policy "sync_records_select"
on public.sync_records
for select
to service_role
using (true);

create policy "sync_records_insert"
on public.sync_records
for insert
to service_role
with check (true);

create policy "sync_records_update"
on public.sync_records
for update
to service_role
using (true)
with check (true);

create policy "sync_records_delete"
on public.sync_records
for delete
to service_role
using (true);

grant select, insert, update, delete on public.sync_records to service_role;
