# Estrategia de sincronización — escritorio

## Comportamiento actual

- SQLite es el punto de operación local y permite trabajar sin red.
- `cloudSyncService` mantiene una lista explícita de tablas, forma IDs como `ámbito:tabla:id` y hace upsert en `sync_records` con clave primaria `(table_name, record_id)`.
- El push es por lotes de hasta 300; el pull pagina de 1.000 en 1.000 por `synced_at` y `offset`.
- La app guarda un cursor compartido de push/pull en `cloud_sync_state.json`. Un cambio local programa un push tras 500 ms; el planificador intenta ambas direcciones cada 5 minutos y a los 90 segundos del arranque.
- `password_hash` y otros campos sensibles se excluyen. Los adjuntos Base64 mayores de 65.536 caracteres se suben a Storage y la fila guarda descriptor con ruta, tamaño y SHA-256.
- La fila se omite si un adjunto falla y el cursor no se avanza si la sincronización completa falla. El pull verifica claves foráneas al final.

## Problemas que deben resolverse

1. Desktop usa `service_role`; el pull no filtra por sede y RLS no limita esa credencial. No habilitar sincronización multi-sede a ADMIN hasta centralizar las solicitudes autenticadas y probar aislamiento.
2. El cursor no es una outbox de operaciones. Un cursor persistido no confirma que cada movimiento se aplicó centralmente ni permite reintento individual.
3. `INSERT OR REPLACE` y último registro recibido pueden sobrescribir filas locales; el comparador LWW de `shared/syncPayload.js` no participa en el pull de desktop.
4. No existe mecanismo de conflicto específico para stock, despacho concurrente o movimiento duplicado.
5. Las tablas sin timestamp compatible se reenvían completas; no hay cifras de bytes, duración o cantidad de páginas.
6. Las llamadas REST no muestran timeout/reintento con espera progresiva explícitos. La siguiente iteración debe agregarlo en el lado servidor, junto a confirmaciones idempotentes.

## Reglas recomendadas para el siguiente release

- Autenticar cada dispositivo/usuario en un servicio central; el servidor deriva rol y sede de credenciales verificadas, nunca de parámetros enviados por React.
- Mantener cambios y operaciones pendientes de forma durable en SQLite; cada operación de inventario recibe ID estable e idempotency key.
- El servidor confirma el ID procesado; solo entonces el cliente marca el elemento completado. Respuestas ambiguas se reintentan con la misma clave.
- Stock se actualiza mediante comandos transaccionales y validación central de disponibilidad, sede y estado. Conflictos se conservan como `PENDIENTE_REVISION`; nunca resolver cantidades por LWW.
- Estados maestros de usuario/catálogo tienen autoridad central; datos de trabajo no sincronizados mantienen copia local. La matriz de [arquitectura](architecture.md) es provisional hasta validar reglas con el negocio.
- En archivos, mantener estados explícitos de pendiente/cargado/verificado/fallido y hash; el negocio solo completa la transición que exige evidencia después de verificarla.
- Hacer pulls por cursor estable del servidor, con orden total `(synced_at, record_id)` o token opaco, sin paginar por offset sobre datos que cambian simultáneamente.
- Exportar métricas agregadas sin PII: solicitudes, filas, bytes, duración, fallos, edad de cola y reintentos.

## Estado

La estrategia recomendada no se implementó completamente porque necesita un endpoint central, políticas de autoridad y pruebas multi-dispositivo que no están disponibles en este checkout. La sincronización solo se considera operativa offline; su aislamiento central y consistencia concurrente quedan **no verificados**.
