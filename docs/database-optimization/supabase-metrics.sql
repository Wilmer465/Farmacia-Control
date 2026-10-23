-- Diagnostico de solo lectura para el esquema de sincronizacion de Farmacia-Control.
-- Ejecutar desde Supabase SQL Editor con acceso de lectura. No crea objetos ni modifica datos.

-- 1) Tamano del proyecto, tabla sync_records, heap, indices y TOAST.
select
  current_database() as database_name,
  pg_database_size(current_database()) as database_bytes,
  pg_size_pretty(pg_database_size(current_database())) as database_size,
  pg_relation_size('public.sync_records'::regclass) as sync_records_heap_bytes,
  pg_indexes_size('public.sync_records'::regclass) as sync_records_index_bytes,
  pg_total_relation_size('public.sync_records'::regclass) as sync_records_total_bytes,
  pg_size_pretty(pg_total_relation_size('public.sync_records'::regclass)) as sync_records_total_size;

-- 2) Tablas e indices de usuario: n_live_tup es una estimacion de estadisticas,
-- pg_total_relation_size incluye heap, indices y TOAST.
select
  schemaname,
  relname as table_name,
  n_live_tup as estimated_rows,
  n_dead_tup as estimated_dead_rows,
  pg_relation_size(relid) as heap_bytes,
  pg_indexes_size(relid) as index_bytes,
  pg_total_relation_size(relid) as total_bytes
from pg_stat_user_tables
order by pg_total_relation_size(relid) desc;

-- 3) Filas y tamano de los sobres JSON por tabla logica.
-- count(*) es exacto al ejecutar; pg_column_size(data) mide JSONB, sin overhead total de fila.
select
  table_name,
  count(*) as exact_rows,
  coalesce(sum(pg_column_size(data)), 0) as jsonb_bytes,
  coalesce(avg(pg_column_size(data)), 0)::bigint as avg_jsonb_bytes,
  coalesce(max(pg_column_size(data)), 0) as max_jsonb_bytes,
  min(synced_at) as oldest_current_sync,
  max(synced_at) as newest_current_sync
from public.sync_records
group by table_name
order by jsonb_bytes desc;

-- 4) Indices especificos de sync_records.
select
  indexname,
  indexdef,
  pg_relation_size(format('%I.%I', schemaname, indexname)::regclass) as index_bytes
from pg_indexes
where schemaname = 'public' and tablename = 'sync_records'
order by index_bytes desc;

-- 5) Auditoria actual en el sobre y su peso. Es una fotografia del estado actual,
-- no un historial de crecimiento: sync_records guarda la version mas reciente de cada ID.
select
  count(*) as audit_rows,
  coalesce(sum(pg_column_size(data)), 0) as audit_jsonb_bytes,
  min(data ->> 'fecha') as oldest_audit_date_text,
  max(data ->> 'fecha') as newest_audit_date_text
from public.sync_records
where table_name = 'auditoria';

-- 6) Metadatos de Storage por bucket. El total basado en metadata es una estimacion;
-- comparar con Storage Usage del Dashboard, que es la fuente de cuota facturable.
select
  bucket_id,
  count(*) as objects,
  coalesce(sum(case
    when metadata ->> 'size' ~ '^[0-9]+$' then (metadata ->> 'size')::bigint
    else 0
  end), 0) as metadata_bytes
from storage.objects
group by bucket_id
order by metadata_bytes desc;

-- 7) Objetos grandes del bucket blobs; solo nombres/metadatos, no descarga contenido.
select
  bucket_id,
  count(*) as objects,
  coalesce(sum(case
    when metadata ->> 'size' ~ '^[0-9]+$' then (metadata ->> 'size')::bigint
    else 0
  end), 0) as metadata_bytes,
  max(case
    when metadata ->> 'size' ~ '^[0-9]+$' then (metadata ->> 'size')::bigint
    else 0
  end) as largest_object_bytes
from storage.objects
where bucket_id = 'blobs'
group by bucket_id;

-- 8) La tabla no conserva versiones: snapshots repetidos de las consultas 1-7
-- deben guardarse fuera de PostgreSQL para calcular crecimiento semanal/mensual.
