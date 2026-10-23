# Auditoría de SQLite y Supabase — aplicación de escritorio

**Fecha:** 2026-10-23  
**Alcance:** aplicación de escritorio Electron + React, SQLite usada por escritorio y su integración de escritorio con Supabase.  
**Fase:** auditoría y ejecución de mejoras reversibles de configuración/documentación; no se modificó el esquema ni los datos.

## Resumen ejecutivo

El escritorio usa SQLite local con `better-sqlite3` en el proceso principal de Electron. El renderer se comunica mediante IPC (`window.api`); los servicios backend implementan la lógica de negocio y la sincronización REST. El espejo remoto definido por el repositorio es `public.sync_records` (JSONB), y los adjuntos grandes de firma/documento pueden guardarse en el bucket privado `blobs`.

La base local de desarrollo inspeccionada pasó `PRAGMA integrity_check`. Medía 946.176 bytes, con WAL de 37.112 bytes y SHM de 32.768 bytes en el momento de la consulta. No se obtuvo acceso verificable a métricas de Supabase, por lo que no hay medición del tamaño remoto, transferencia, crecimiento ni ahorro potencial.

Los hallazgos prioritarios son: (1) el pull de escritorio usa `service_role` sin filtrar por sede, por lo que un ADMIN puede recibir filas de otras sedes; (2) las tablas sin una columna temporal reconocida vuelven a subirse completas; y (3) provisionar `service_role` en cada instalación permitiría a un usuario con control del equipo extraer una credencial privilegiada. No se confirmó que una clave privilegiada esté incluida en el paquete actual. Se corrigió la discrepancia que permitía activar el planificador con una clave publicable sola.

## Arquitectura de escritorio observada

- **Renderer:** React/Vite; llama a las funciones expuestas por `electron/preload.js` mediante `window.api`.
- **Proceso principal:** Electron registra IPC (`backend/ipcHandlers.js`), inicializa SQLite y programa la sincronización (`electron/main.js`).
- **Persistencia local:** `better-sqlite3`; en desarrollo la ruta observada es `data/farmacia.db`. La conexión configura WAL, claves foráneas, caché y mantenimiento SQLite.
- **Sincronización:** `backend/services/cloudSyncService.js` serializa filas de las tablas listadas en `SYNC_TABLES` a `sync_records`, paginadas en lotes de hasta 300 al subir y 1.000 al bajar. Guarda el cursor local en `cloud_sync_state.json`; intenta sincronización periódica cada cinco minutos y una subida diferida tras cambios locales.
- **Adjuntos:** `firma_data` y `documento_adjunto_data` son columnas `TEXT`. Los valores Base64 mayores de 65.536 caracteres se sustituyen en el sobre por descriptores; el servicio los sube a Storage y calcula SHA-256 para verificarlos al descargar.
- **Esquema remoto versionado:** `supabase_schema.sql` define `sync_records`, PK compuesta, RLS y permisos de `service_role`. `supabase/migrations/001_rls_sede_sync_records.sql` añade índices incrementales, políticas para `authenticated` por sede y el bucket privado `blobs`. El repositorio no demuestra que estas definiciones coincidan con el estado actualmente desplegado.

## Inventario SQLite local

La inspección de solo lectura encontró 19 tablas funcionales y la tabla `migrations`. Conteos observados en la copia de desarrollo:

| Tabla | Filas |
|---|---:|
| auditoria | 615 |
| orden_detalles | 501 |
| movimientos_inventario | 383 |
| despacho_detalle | 288 |
| despachos | 288 |
| entregas | 287 |
| ordenes | 250 |
| solicitudes_eliminacion | 50 |
| lotes | 80 |
| medicamentos | 20 |
| usuarios | 8 |
| sedes | 4 |
| roles | 4 |

`catalogo_cum`, `catalogo_empaques`, `receptores` y `solicitudes_intercambio` no tenían filas en esta copia. Las relaciones declaradas dependen de los `FOREIGN KEY` en migraciones; el chequeo de integridad general pasó, pero no se realizó inventario exhaustivo de todas las relaciones ni una validación funcional de negocio.

### Tamaño e integridad local

| Métrica | Observación |
|---|---:|
| `data/farmacia.db` | 946.176 bytes |
| `data/farmacia.db-wal` | 37.112 bytes |
| `data/farmacia.db-shm` | 32.768 bytes |
| `page_count` | 231 |
| `page_size` | 4.096 bytes |
| `freelist_count` | 0 |
| Modo journal | WAL |
| `PRAGMA integrity_check` | `ok` |

El diagnóstico readonly ejecutado bajo Electron pudo usar `dbstat`. Objetos con más páginas: `auditoria` 94.208 bytes, `sqlite_stat4` 77.824, `ordenes` 53.248, `entregas` 40.960, `sqlite_schema` 36.864, `idx_auditoria_fecha_sede` 32.768, `orden_detalles` 24.576 y `movimientos_inventario` 24.576. No se propone eliminar ningún índice: el tamaño global es pequeño y el informe no encuentra evidencia suficiente de redundancia funcional. El script activa `foreign_keys` solo en su conexión de lectura y `foreign_key_check` devolvió cero violaciones.

Los agregados de contenido consultados, sin leer valores, fueron: `entregas.firma_data`, 179 valores no nulos, 7.339 caracteres agregados y máximo de 41; `ordenes.firma_data`, 170 valores, 6.970 caracteres agregados y máximo de 41. No había valores no nulos en las columnas consultadas de adjuntos. Las longitudes pequeñas son compatibles con datos de prueba o marcadores y no permiten inferir el tamaño de firmas reales futuras.

## Hallazgos comprobados y riesgos

### Sincronización y transferencia

1. **El pull privilegiado no filtra por sede — comprobado en código.** `verificarPermiso()` admite `ADMIN` y `SUPERADMIN`; `bajar()` consulta `sync_records` con `service_role` y sin filtro de sede. `service_role` evita RLS, así que un ADMIN puede descargar filas de otras sedes. Prioridad: alta; requiere autorización en un servicio central confiable.
2. **Credencial privilegiada en cliente de escritorio — riesgo arquitectónico.** El servicio usa `SUPABASE_SERVICE_ROLE_KEY` desde el proceso main. Un usuario que controla el equipo puede inspeccionar el proceso. Si la clave se provisiona a cada instalación, el impacto potencial es alto. No se inspeccionó el valor de `.env` ni se confirmó el método de distribución.
3. **La habilitación con clave publicable era incompatible con las solicitudes — corregido.** `syncHabilitado` ahora requiere URL y `SUPABASE_SERVICE_ROLE_KEY`; el planificador no inicia si falta una. El modo actual sigue dependiendo de una credencial privilegiada, con el riesgo anterior.
4. **Tablas sin fecha reconocida se suben completas — comprobado en código.** `getRowsToSync()` filtra por la primera columna temporal conocida; si no existe, selecciona todas las filas. No se midió el volumen por tabla.
5. **El pull usa `offset`/`synced_at` y no hay métricas persistentes de bytes/solicitudes — comprobado en código.** El servicio registra filas y errores, no páginas, latencia, bytes ni reintentos acumulados.
6. **No hay cola persistente por operación ni resolución de conflictos aplicada en pull — comprobado en código.** El cursor es un único JSON; `shared/syncPayload.js` incluye `compararLWW`, pero `cloudSyncService.bajar()` no lo llama y usa `INSERT OR REPLACE`. No hay política específica de conflictos para inventario.
7. **Borrados remotos se representan como estados, no DELETE autenticado — comprobado en la migración.** La consistencia de todos los flujos de borrado no se declara verificada.

### Índices y rendimiento local

- Se observaron índices solapados por prefijo o columnas: `lotes` tiene índices `(medicamento_id, sede_id, estado_manual)` y `(sede_id, medicamento_id, estado_manual)`, además de índices separados por medicamento y sede; `ordenes` tiene `(sede_id, estado, fecha_creacion)` y `(sede_id, fecha_creacion)`, además de índices separados; `despachos` tiene `(orden_id, sede_id, fecha)` y `(orden_id)`.
- La migración `026_optimizar_catalogo_cum.js` ya contiene trabajo de reducción de índices de catálogo. Aunque `dbstat` mide el tamaño local, faltan planes `EXPLAIN QUERY PLAN` de cargas representativas y mediciones de escritura para declarar índices redundantes o estimar ahorro.
- Los servicios de órdenes y entregas proyectan listados sin blobs según comentarios de repositorio, lo cual reduce lecturas innecesarias en esas rutas; no se midió rendimiento comparativo.

### Seguridad y privacidad

1. **Riesgo condicionado de credencial privilegiada en cliente de escritorio — diseño observado.** El servicio usa `SUPABASE_SERVICE_ROLE_KEY` para sincronización REST y Storage; el código indica que permanece en proceso principal, no en renderer. Si se entrega esa clave a cada instalación (por entorno o empaquetado), el propietario del equipo controla el proceso y puede extraerla. Como la clave privilegiada evita las restricciones RLS habituales, el impacto potencial es alto. No se inspeccionó ni expuso el contenido de `.env`, y no se confirmó cómo se distribuye la clave.
2. **RLS por sede existe en el SQL versionado — comprobado en archivos, despliegue no comprobado.** La política de `authenticated` compara `data.sede_id` con `app_metadata.sede_id`, con excepción de tablas globales y rol `SUPERADMIN`. La integración de escritorio observada usa `service_role`, así que la política no debe tratarse como límite de autorización de las llamadas privilegiadas del escritorio.
3. **Los hashes se excluyen de la sincronización — comprobado en código.** `sanitizarFila()` excluye `password_hash`, `password`, `token` y `secret`. La descarga preserva el hash local y omite la creación de usuario si no hay credencial local.
4. **Firmas/documentos son potencialmente sensibles.** Hay columnas de firma y adjuntos en texto y Storage privado definido en SQL. No se revisó contenido, no se inspeccionó política remota efectiva y los datos locales no permiten estimar volumen relevante de producción.

## Respaldos y recuperación

`backend/services/backupService.js` usa `db.backup()`, comprueba integridad, ofrece respaldos automáticos y permite restauración con autorización y validación de ruta. En el estado de trabajo actual, el código no purga respaldos automáticamente; existe un plan local para conservarlos. `docs/backups.md` todavía describe la retención automática y no refleja ese cambio pendiente. No se creó un respaldo ni se probó una restauración en esta fase.

Los respaldos locales de SQLite no equivalen a copia de los objetos del bucket Supabase. No se encontró evidencia en el material revisado de una estrategia de backup y restauración de Storage que permita recuperar firmas y adjuntos junto con la base local.

## Información no disponible

- Tamaño total remoto, tamaño de `sync_records`, tablas/índices mayores, filas remotas y crecimiento histórico.
- Frecuencia y bytes de solicitudes, latencia, fallos acumulados, reintentos, objetos almacenados y objetos huérfanos en Storage.
- Políticas RLS realmente desplegadas, grants efectivos, estado de bucket y configuración Data API del proyecto conectado.
- Planes de consultas PostgreSQL, métricas de consultas lentas y accesibilidad a Supabase.
- Volumen de base de producción y prueba práctica de restauración de SQLite y documentos.

No se consultó Supabase porque el repositorio no proporciona evidencia segura y verificable de una sesión de diagnóstico de solo lectura; no se intentó abrir ni imprimir credenciales del entorno. No se incluyen datos personales ni contenido de firmas/documentos.

## Recomendaciones priorizadas

| Prioridad | Recomendación | Impacto esperado / limitación |
|---|---|---|
| Alta | Confirmar que ninguna clave `service_role` se entrega dentro del instalador o a equipos no confiables; si cada cliente necesita sincronización, usar un límite de confianza servidor controlado y credenciales acotadas. | Reduce el riesgo de acceso privilegiado. Requiere decidir arquitectura y validar el despliegue real; no se cambia en esta fase. |
| Alta | Obtener métricas de Supabase con acceso de solo lectura y medir tamaño por tabla/índice, Storage y crecimiento. | Permite priorizar cambios con datos reales; actualmente no hay base para calcular ahorros. |
| Media | Revisar tablas sin columna temporal compatible y cuantificar cuántas filas vuelve a enviar cada sincronización. | Puede reducir transferencia; definir cursor/deltas necesita mantener semántica de actualizaciones y borrados. |
| Alta | Sustituir el acceso `service_role` desde el escritorio por una API central autenticada y autorizada por sede. | Necesita despliegue central y pruebas RLS; no existe un endpoint central en este repositorio. |
| Media | Medir planes y escrituras para los índices candidatos antes de proponer cambios. | Evita degradar consultas o restricciones al reducir índices. |
| Media | Documentar y probar restauración de objetos de Storage en conjunto con los respaldos SQLite. | Cierra una brecha potencial de recuperación de adjuntos; el estado actual no se verificó. |

## Ahorros estimados y limitaciones

No se calcula porcentaje ni volumen de ahorro. No hay datos remotos ni historial de transferencia. La reducción de índices solo puede estimarse después de medir su tamaño y confirmar que no soportan restricciones o consultas críticas. Las firmas medidas en esta copia local son pequeñas y no son representativas de producción.

### Cuotas públicas del plan Free (consulta oficial: 2026-10-23)

No se pudo identificar el plan real ni consultar el panel del proyecto; los siguientes son límites públicos de referencia, no métricas de esta instalación:

- Base de datos: 500 MB por proyecto en Free; al exceder la cuota, la base puede pasar a modo solo lectura.
- Storage: 1 GB en Free.
- Egress: cuota de transferencia gratuita de hasta 5 GB sin caché y 5 GB con caché; egress agrega tráfico de servicios según la clase aplicable.
- Proyectos Free de baja actividad pueden pausarse después de 7 días.
- La documentación de producción indica que backups de base Free no están disponibles para descarga desde el panel.

Fuentes oficiales: [facturación y cuotas](https://supabase.com/docs/guides/platform/billing-on-supabase), [tamaño de base de datos](https://supabase.com/docs/guides/platform/database-size), [egress](https://supabase.com/docs/guides/platform/manage-your-usage/egress), [pausa por inactividad](https://supabase.com/docs/guides/platform/free-project-pausing) y [checklist de producción](https://supabase.com/docs/guides/deployment/going-into-prod). No se proyecta crecimiento por falta de serie histórica.

## Estado de cambios

El archivo se actualizó durante la fase para distinguir correcciones aplicadas de riesgos pendientes. No se aplicaron migraciones ni se alteraron datos. Se preservaron las modificaciones locales preexistentes de respaldos, UI, pruebas y `data/`.
