# Sync Supabase offline-first (Fase 0)

SQLite local = verdad operativa. Supabase `sync_records` + `storage.blobs` = transporte.
Todo funciona sin internet; con conexión se sube/baja en segundo plano sin bloquear la UI.

## Aplicar la nube (orden)

1. `supabase_schema.sql` (base: tabla + políticas `service_role`).
2. `supabase/migrations/001_rls_sede_sync_records.sql` (puerta móvil: RLS `authenticated`, índices de pull, bucket `blobs`).

## Convenciones (no cambiar sin migrar ambos lados)

* `record_id`: `global:<tabla>:<id>` o `<sede_id>:<tabla>:<id>` (`shared/syncEnvelope.js` ↔ `mobile-app/src/constants/syncEnvelope.ts`).
* Globales: `roles, sedes, catalogo_cum, catalogo_empaques, catalogo_actualizaciones`.
* JWT (`app_metadata`): `sede_id` texto, `rol_nombre`, `usuario_id`. `SUPERADMIN` ve todo.
* Blobs >64 KB base64 (`firma_data`, `documento_adjunto_data`) van a `blobs/<sede>/<tabla>/<record_id>/<campo>`; en `data` queda `{__blob_ref, __sha256, __size}`.
* Borrados como `UPDATE` (`ELIMINADO`/`DADO_DE_BAJA`). `password_hash` nunca sube.
* LWW por `local_updated_at`, desempate `synced_at` servidor. Push antes que pull.

## Provisionar Auth (requiere runtime Electron por la ABI de better-sqlite3)

```powershell
$env:ELECTRON_RUN_AS_NODE = "1"
& ".\node_modules\electron\dist\electron.exe" ".\scripts\provisionar-auth.js" --dry-run
& ".\node_modules\electron\dist\electron.exe" ".\scripts\provisionar-auth.js" --aplicar
```

Crea `auth.users` con email `<username>@farmacia.local`, enlaza `usuarios.auth_user_id`
(migración 029 desktop/móvil) y muestra la temporal solo al crear. Primer login móvil
exige internet (cachea credencial); sin red posterior usa caché + PIN/biometría.

## Done Fase 0

* [x] SQL aplicado sin errores dos veces (idempotente).
* [x] Token sede A lee A + globales, sede B = 0; `anon` = 0.
* [x] `029` aplicada en ambas bases (`auth_user_id` + índice).
* [x] `--dry-run` lista usuarios sin cambios; `--aplicar` enlaza sin tocar `password_hash`.

## Fases 1-3 (implementado)

* **Contrato compartido:** `shared/syncEnvelope.js` ↔ `mobile-app/src/constants/syncEnvelope.ts`,
  `shared/syncPayload.js` ↔ `mobile-app/src/utils/syncPayload.ts`. Tests en
  `tests/sync-offline/supabase_envelope.test.js` (19/19, corre con Node CLI:
  no toca better-sqlite3).
* **Móvil (Fase 1):** `SupabaseSyncProvider` (push/pull directo a `sync_records` +
  blobs a Storage como texto base64 con hash; `EXPO_PUBLIC_SUPABASE_URL/_ANON_KEY`,
  jamás service_role), `AuthService.loginSupabase` (email `<user>@farmacia.local`,
  sesión en SecureStorage separada de la LAN; offline: sesión cacheada o bcrypt
  local; instalación fresca sin red no entra por diseño), gate sin conexión en
  `SyncEngine.sync` (la cola espera), pull con cursor `synced_at`, convergencia
  LWW con registro de conflicto, `usuarios` preserva hash local + flag
  `debe_restablecer_contrasena`.
* **Desktop (Fase 2):** `cloudSyncService.subir` con `record_id` namespaced +
  subida de blobs a Storage con service_role (la fila se omite si el adjunto
  falla; el cursor no avanza), `bajar` normaliza objetos a texto y ordena por
  `synced_at`, `descargarBlob` con verificación de hash para uso bajo demanda.
* **Sin red todo opera en local** en ambas apps; con conexión se sube/baja en
  fondo sin bloquear la UI. Fallo de red = reintento, nunca pérdida.
