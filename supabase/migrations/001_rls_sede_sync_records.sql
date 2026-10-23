-- Fase 0 — Supabase como hub offline-first (auth nativo, RLS simple, blobs por referencia).
--
-- Orden de aplicación:
--   1) supabase_schema.sql (base: tabla sync_records + políticas service_role)
--   2) este archivo (puerta móvil: RLS para authenticated + bucket blobs)
--
-- Todo idempotente: puede aplicarse dos veces sin cambios (IF NOT EXISTS,
-- DROP POLICY IF EXISTS + CREATE POLICY, INSERT ... ON CONFLICT DO NOTHING).
--
-- Convenciones (espejo en shared/syncEnvelope.js y mobile-app/src/constants/syncEnvelope.ts):
--   * record_id namespaced: 'global:<tabla>:<id>' para tablas globales,
--     '<sede_id>:<tabla>:<id>' para el resto.
--   * Tablas globales legibles por todo authenticated:
--     roles, sedes, catalogo_cum, catalogo_empaques, catalogo_actualizaciones.
--   * El JWT de Supabase Auth lleva en app_metadata: sede_id (texto), rol_nombre, usuario_id.
--   * Los binarios grandes (>64 KB base64) NO viajan en data: van a storage.blobs
--     en la ruta '<sede_id>/<tabla>/<record_id>/<campo>' y en data queda el descriptor
--     {__blob_ref, __sha256, __size}.

-- 1) Índice para el pull incremental (?synced_at=gte.<cursor>&order=...&limit=&offset=).
create index if not exists idx_sync_records_synced_at
  on public.sync_records (synced_at desc);

create index if not exists idx_sync_records_tabla_synced
  on public.sync_records (table_name, synced_at desc);

-- 2) Helpers: sede y rol del JWT (app_metadata fijado al provisionar el usuario).
create or replace function public.mi_sede() returns text
  language sql stable as $$
    select nullif(auth.jwt()->'app_metadata'->>'sede_id', '')
  $$;

create or replace function public.mi_rol() returns text
  language sql stable as $$
    select auth.jwt()->'app_metadata'->>'rol_nombre'
  $$;

-- 3) Visibilidad simple: SUPERADMIN todo; globales para todo authenticated;
--    el resto solo cuando data->>'sede_id' coincide con la sede del JWT.
create or replace function public.fila_sync_visible(fila public.sync_records) returns boolean
  language sql stable as $$
    select
      public.mi_rol() = 'SUPERADMIN'
      or fila.table_name in
        ('roles', 'sedes', 'catalogo_cum', 'catalogo_empaques', 'catalogo_actualizaciones')
      or (
        fila.data ? 'sede_id'
        and fila.data->>'sede_id' = public.mi_sede()
      )
      -- Compatibilidad: filas globales viejas sin sede_id y con record_id 'global:...'.
      or (
        not (fila.data ? 'sede_id')
        and fila.record_id like 'global:%'
      )
  $$;

-- 4) RLS para authenticated (la base ya revocó anon; service_role sigue intacto).
drop policy if exists "sync_records_select_auth" on public.sync_records;
create policy "sync_records_select_auth"
  on public.sync_records
  for select
  to authenticated
  using (public.fila_sync_visible(sync_records));

drop policy if exists "sync_records_insert_auth" on public.sync_records;
create policy "sync_records_insert_auth"
  on public.sync_records
  for insert
  to authenticated
  with check (public.fila_sync_visible(sync_records));

drop policy if exists "sync_records_update_auth" on public.sync_records;
create policy "sync_records_update_auth"
  on public.sync_records
  for update
  to authenticated
  using (public.fila_sync_visible(sync_records))
  with check (public.fila_sync_visible(sync_records));

-- Sin DELETE para authenticated: los borrados viajan como UPDATE
-- (ELIMINADO / DADO_DE_BAJA). Solo service_role borra.
drop policy if exists "sync_records_delete_auth" on public.sync_records;

-- Grants necesarios para que las políticas de authenticated apliquen.
grant select, insert, update on public.sync_records to authenticated;

-- 5) Bucket privado para binarios grandes (firmas, documentos adjuntos).
insert into storage.buckets (id, name, public)
  values ('blobs', 'blobs', false)
  on conflict (id) do nothing;

-- RLS de storage por prefijo '<sede_id>/...'. SUPERADMIN sin restricción.
drop policy if exists "blobs_select_auth" on storage.objects;
create policy "blobs_select_auth"
  on storage.objects
  for select
  to authenticated
  using (
    bucket_id = 'blobs'
    and (
      public.mi_rol() = 'SUPERADMIN'
      or split_part(name, '/', 1) = public.mi_sede()
    )
  );

drop policy if exists "blobs_insert_auth" on storage.objects;
create policy "blobs_insert_auth"
  on storage.objects
  for insert
  to authenticated
  with check (
    bucket_id = 'blobs'
    and (
      public.mi_rol() = 'SUPERADMIN'
      or split_part(name, '/', 1) = public.mi_sede()
    )
  );

drop policy if exists "blobs_update_auth" on storage.objects;
create policy "blobs_update_auth"
  on storage.objects
  for update
  to authenticated
  using (
    bucket_id = 'blobs'
    and (
      public.mi_rol() = 'SUPERADMIN'
      or split_part(name, '/', 1) = public.mi_sede()
    )
  )
  with check (
    bucket_id = 'blobs'
    and (
      public.mi_rol() = 'SUPERADMIN'
      or split_part(name, '/', 1) = public.mi_sede()
    )
  );

-- Sin DELETE para authenticated: los blobs huérfanos se purgan con service_role.
drop policy if exists "blobs_delete_auth" on storage.objects;
