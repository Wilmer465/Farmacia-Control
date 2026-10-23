# Validación de optimización — escritorio

**Fecha de ejecución:** 2026-10-23  
**Alcance:** Electron/React de escritorio, SQLite local y código de sincronización de escritorio.

## Cambios realizados

- La bandera de habilitación ahora requiere URL y `SUPABASE_SERVICE_ROLE_KEY`; el planificador no agenda intentos cuando faltan.
- La cabecera `apikey` usa la publishable key si está configurada y recurre a la service role solo cuando esa es la única credencial configurada; el token Bearer sigue siendo la service role exigida por el servicio actual.
- `.env.example` ya no contiene una URL/key de proyecto y explica que service role no se distribuye a instalaciones.
- Añadido `scripts/diagnostico-sqlite.js`, abre la base en readonly y muestra metadatos/conteos/agregados de adjuntos sin valores de fila.
- Añadidos tests unitarios del contrato de habilitación.
- Añadidos documentos de arquitectura, plan, estrategia de sync y backup/recuperación.

## Evidencia de solo lectura anterior a los cambios

- `data/farmacia.db`: 946.176 bytes, 231 páginas de 4.096, 0 freelist pages, WAL 37.112 bytes, SHM 32.768 bytes.
- `PRAGMA integrity_check`: `ok`; `foreign_key_check`: 0 violaciones con `foreign_keys=ON` en conexión readonly.
- `dbstat` disponible bajo Electron; objeto mayor `auditoria` 94.208 bytes, seguido por estadísticas `sqlite_stat4` 77.824 bytes.
- Supabase remoto no consultado; no hay mediciones antes/después de PostgreSQL, Storage ni egress.

## Resultado de comandos

| Verificación | Resultado |
|---|---|
| Tests unitarios `supabase_config.test.js` (Node CLI, no SQLite nativo) | 3/3 pasaron. |
| Diagnóstico readonly con Electron runtime | Completado; `integrity_check=ok`, 0 violaciones FK, 20 tablas incluyendo migraciones, tamaños emitidos sin valores de filas. |
| `node --check` config, sync service y script diagnóstico | Pasó. |
| Lint | `npm run lint` terminó con código 0: 0 errores y 42 warnings en archivos no modificados por esta fase. |
| Suite DB/IPC/sync con `electron.exe --test` | El runtime imprimió solo `TAP version 13` y no informó casos; no se cuenta como prueba pasada. |
| Build React (`npm run build:react`) | Pasó: 58 módulos transformados; Vite avisó que su API CJS está obsoleta. |
| ABI `better-sqlite3` en Electron | Pasó: Electron Node 20.18.1, ABI 128, SQLite 3.49.2; conexión en memoria exitosa. |
| Guard del planificador sin credenciales | Pasó en Electron: sincronización no agenda tareas sin URL/service role. |
| Rebuild temporal para suite Electron | No disponible: `npm run rebuild:node` falló con `EBUSY` porque el binario nativo estaba en uso. No se cerraron procesos Electron activos; se confirmó después que el binario sigue en ABI Electron 128. |
| Restore desde backup en ambiente aislado | Pendiente; no se creó backup ni se alteró la BD de desarrollo. |
| Acceso a Supabase y pruebas RLS/Storage | Pendiente; no se pudo confirmar cuenta/plan/esquema remoto. |

## Criterios pendientes

- Aislamiento entre sedes del pull: **no aprobado**; el servicio desktop consulta con `service_role` sin filtro de sede.
- Idempotencia de operaciones de inventario y conflicto multi-dispositivo: **no verificado**; no existe prueba/confirmación por operación.
- Recuperación de Storage junto a SQLite: **no verificada**.
- Consumo, crecimiento y ahorros Supabase: **no medidos**.
- Pruebas de pedidos, despachos, firma, auditoría y concurrencia: **no ejecutadas en esta fase**.

No se declara el sistema validado. El detalle de bloqueos y pasos seguros siguientes está en [optimization-plan.md](optimization-plan.md) y [sync-strategy.md](sync-strategy.md).
