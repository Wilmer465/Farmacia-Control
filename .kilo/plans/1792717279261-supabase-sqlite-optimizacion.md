# Plan: Auditoría y optimización de Supabase + SQLite — Farmacia-Control

## Estado detectado (verificado en código)

- **SQLite local** (`data/farmacia.db`, `better-sqlite3`): `roles, sedes, usuarios, auditoria, medicamentos, lotes, receptores, ordenes, despachos, entregas, solicitudes_eliminacion, solicitudes_intercambio, movimientos_inventario, catalogo_cum, catalogo_empaques, catalogo_actualizaciones`. Migraciones en `backend/database/migrations/`, runner `migrate.js` (atómico por defecto, `atomic: false` para `VACUUM`, registra por `migration.name`).
- **Supabase (PostgreSQL)**: solo tabla `public.sync_records` (`supabase_schema.sql`) + bucket Storage `blobs` (`supabase/migrations/001_rls_sede_sync_records.sql`). Los binarios >64 KB (`firma_data`, `documento_adjunto_data`) se externalizan a Storage vía `cloudSyncService.js`; en `data` viajan solo descriptores `{__blob_ref, __sha256, __size}`.
- `npm run migrate` y `npm run test` requieren runtime Electron (`ELECTRON_RUN_AS_NODE=1` + `electron.exe`), no Node CLI (AGENTS.md).
- No hay esquema PostgreSQL completo: no existen tablas `entregas`/`receptores`/`movimientos`/`usuarios` en Supabase.

## Decisión pendiente (una sola pregunta)

**¿El alcance de la optimización en Supabase es solo `sync_records` + Storage `blobs` (lo que existe), o se deben crear tablas completas en PostgreSQL (`entregas`, `receptores`, `movimientos`, `usuarios`, etc.) para replicar datos de SQLite a la nube?**

Respuesta recomendada: solo `sync_records` + `blobs`. Crear tablas nuevas en Supabase sería un cambio de arquitectura mayor (fuera del alcance de "optimizar lo existente") y rompería el modelo offline-first actual donde SQLite es fuente operativa y Supabase es espejo de sincronización.

## Plan de trabajo (fases, sin modificaciones destructivas todavía)

### Fase 1 — Auditoría de solo lectura (diagnóstico)
- Inventario de tablas SQLite y columnas (de las migraciones existentes).
- Inventario de Supabase: `sync_records`, políticas RLS, bucket `blobs`, índices de `sync_records`.
- Identificar columnas grandes: `documento_adjunto_data` (TEXT base64 en SQLite; viaja a Storage si >64 KB), `firma_data`, `valores_anteriores`/`valores_nuevos` (JSON texto en auditoría).
- Detectar índices redundantes en SQLite (ej. `009` y `017` sobre `lotes`/`ordenes`/`solicitudes` con columnas solapadas).
- Medir tamaños con `pg_total_relation_size` (no disponible localmente; documentar cómo obtenerlo en Supabase Dashboard) y `page_count`/`freelist_count` en SQLite.
- Salida: `docs/database-optimization/audit-report.md`.

### Fase 2 — Clasificación de datos (Sin cambios de datos)
- Confirmar qué tablas son locales-only vs sincronizadas (`SYNC_TABLES` en `cloudSyncService.js`).
- Verificar que no se dupliquen datos sin necesidad funcional.

### Fase 3 — Optimización de esquema PostgreSQL (`sync_records`)
- Revisar índices de `sync_records`: `idx_sync_records_synced_at`, `idx_sync_records_tabla_synced`. ¿Se usan en el pull incremental (`cloudSyncService.js:293`)?
- Evaluar RLS: políticas `authenticated` vs `service_role`.
- No crear tablas nuevas salvo respuesta afirmativa a la pregunta pendiente.

### Fase 4 — Archivos binarios
- Verificar que `firma_data` y `documento_adjunto_data` >64 KB se externalicen a Storage (ya lo hace `cloudSyncService.js`).
- Confirmar que en SQLite queden solo descriptores, no base64 completo.

### Fase 5 — Optimización de SQLite
- `ANALYZE`, `PRAGMA optimize`, `VACUUM` (fuera de transacción, `atomic: false` como en `026`).
- Revisar índices duplicados/ínútiles (precedente `026_optimizar_catalogo_cum.js`).
- No borrar filas históricas ni auditoría.

### Fase 6-10 — Sincronización, consultas, seguridad, límites plan gratuito, implementación
- Validar pull/push incremental, idempotencia (`merge-duplicates`), reintentos.
- RLS por sede (`fila_sync_visible`), sin exponer `service_role`.
- Límites Supabase Free: PostgreSQL <60-70%, Storage, requests, Realtime.
- Migraciones versionadas reversibles, backup antes de cambios destructivos.

## Entregables previstos
- `docs/database-optimization/audit-report.md`
- `docs/database-optimization/optimization-plan.md`
- Migraciones SQL/SQLite revisables y reversibles
- Scripts de diagnóstico no destructivos
- Informe antes/después con métricas reales

## Riesgos abiertos
- Sin acceso a Supabase Dashboard no se pueden medir tamaños reales de PostgreSQL ni Storage.
- `npm run test` falla en línea base (AGENTS.md: `La unidad de medida es obligatoria`, entre otros); comparar contra línea base antes de atribuir fallos.
