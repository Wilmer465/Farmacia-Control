# Arquitectura y propiedad de datos — escritorio

**Alcance:** Electron + React, proceso principal/backend local, SQLite y conexión de escritorio a Supabase. No incluye otros clientes.

## Componentes y límites

| Componente | Responsabilidad observada | Límite / riesgo |
|---|---|---|
| React renderer | UI y solicitudes por `window.api`; sin conexión SQLite directa. | El renderer no debe recibir claves privilegiadas ni decidir permisos. |
| Electron main + IPC | Autenticación local, autorización de handlers, acceso a servicios y planificadores. | El proceso corre en el equipo del usuario; no es un entorno seguro para secretos de servidor. |
| SQLite (`better-sqlite3`) | Operaciones locales, inventario y documentos; WAL y FK activadas por conexión. | Es autoridad de disponibilidad offline y puede divergir durante desconexión. |
| Supabase REST/Storage | Espejo compartido en `sync_records` y objetos grandes en `blobs`. | El escritorio usa `service_role`, por lo que el RLS por sede no limita ese acceso. |
| `backend/server.js` | API HTTP local, por defecto en loopback; rutas actuales de autenticación. | No es un servicio central desplegado ni un proxy cloud confiable. |

## Matriz provisional de propiedad y sincronización

La implementación no define autoridad central formal por entidad. Esta matriz describe el comportamiento actual y una propiedad operativa recomendada; los conflictos siguen pendientes hasta resolver la autorización central.

| Entidad | Origen / ubicación local | Necesidad central | Dirección actual | Autoridad y conflicto | Auditoría, recuperación y retención |
|---|---|---|---|---|---|
| Roles y sedes | Datos maestros en SQLite. | Compartir configuración entre sedes. | Bidireccional. | Cambios administrativos deben validarse centralmente; hoy `service_role` permite upsert sin política por usuario. | Auditar cambios; backup local y central. Retención administrativa. |
| Usuarios | Alta y login local; `password_hash` se excluye del sobre. | Compartir metadatos y vínculo `auth_user_id`. | Bidireccional, con preservación del hash local al bajar. | Credenciales son locales; rol/sede deben provenir de una fuente central autorizada. Conflicto sin resolver. | No sincronizar hashes; auditar cambios de rol/sede; conservar datos necesarios para recuperación de cuenta. |
| Catálogo CUM y empaques | Catálogo SQLite. | Compartido para consultas y recepción. | Bidireccional según tabla. | Fuente maestra debería ser la importación aprobada del catálogo; concurrencia no medida. | Mantener historial de importaciones; documentos asociados requieren respaldo. |
| Medicamentos, lotes y existencias | Operaciones de sede en SQLite. | Compartir existencias y trazabilidad pertinentes. | Bidireccional. | El stock debe derivarse de movimientos transaccionales; LWW no es válido para cantidades. Conflicto concurrente no resuelto en desktop. | Preservar movimientos y auditoría; recuperar desde backup más operaciones pendientes. |
| Movimientos de inventario | Servicios de inventario en SQLite. | Historial central entre sedes. | Bidireccional. | Cada movimiento requiere ID estable e idempotencia; el sobre actual sincroniza filas, no eventos confirmados individualmente. | Retención histórica; no borrar para ahorrar espacio. |
| Órdenes y detalles | Flujo de órdenes local. | Coordinación y reportes multi-sede. | Bidireccional. | Estados requieren transiciones de negocio; resolución genérica no verificada. | Auditar transiciones; respaldar junto a detalles y evidencia. |
| Despachos y entregas | Confirmaciones físicas locales. | Trazabilidad compartida. | Bidireccional. | No declarar despacho completado sin cantidades y evidencia requeridas; concurrencia central no verificada. | Retener comprobantes y auditoría según política legal/operativa. |
| Firmas y adjuntos | Texto Base64 local en columnas `TEXT`. | Compartir si es necesario entre sedes; Storage para valores mayores de 64 KiB. | Referencia en fila y carga/descarga bajo demanda. | La evidencia solo se considera disponible cuando el hash coincide; hay que verificar referencias en restauración. | No purgar originales en migración; backup local y copia separada de Storage. |
| Auditoría y solicitudes | Generación local por servicios. | Consolidación y aprobación multi-sede. | Bidireccional. | Registros históricos son append-only en términos funcionales; evitar REPLACE conflictivo. | Retención definida por requerimiento legal y política aprobada; nunca limpieza automática no autorizada. |
| Estado técnico de sincronización | `cloud_sync_state.json` en el directorio de SQLite. | No requiere almacenamiento relacional central equivalente. | Cursor local de ambos sentidos. | Si se restaura base antigua, el cursor debe resetearse (actualmente lo hace restore). No es una cola por operación. | Incluir en backups/recuperación y conservar evidencia de fallos sin secretos. |

## Flujo de escritorio observado

1. React invoca `window.api`.
2. IPC valida sesión local y delega al controlador/servicio.
3. El servicio escribe en SQLite.
4. Un debounce intenta subir cambios; el planificador intenta sincronizar cada cinco minutos y tras 90 segundos del arranque.
5. `cloudSyncService` sube filas y pull de `sync_records`; adjuntos grandes se suben por REST a Storage.

La operación local no depende de la disponibilidad de Supabase. La fase actual no cambia el flujo de negocio local. El pull actual con `service_role` no ofrece aislamiento efectivo por sede; no debe considerarse listo para múltiples sedes hasta sustituirlo por una ruta central autenticada.

## Estado de autoridad

- **Comprobado:** SQLite mantiene el flujo local; la sincronización se inicia desde el proceso principal y el backend local expone auth en loopback.
- **No verificado:** esquema y RLS realmente desplegados, origen central de cada entidad, acceso de producción y política de conflictos aprobada.
- **Bloqueo de arquitectura:** no existe una API central cloud en el repo que guarde `service_role` y aplique authorization por sede. No se implementó una alternativa de cliente que solo esconda el problema.
