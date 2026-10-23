# Fase 2 — Diagnóstico incremental de consumo (escritorio)

## Optimizaciones existentes confirmadas

- El escritorio sube filas por lotes de hasta 300, externaliza adjuntos Base64 mayores de 65.536 caracteres y guarda el descriptor con hash/tamaño en `sync_records`.
- La descarga usa páginas de 1.000 filas y filtra `synced_at` desde el último inicio de sincronización.
- La vista de entregas evita traer firmas/documentos en listados; las consultas del dashboard agregan datos en SQLite.
- `scripts/diagnostico-sqlite.js` ya mide integridad, conteos por tabla, WAL/SHM y `dbstat`; esta fase añade bytes de adjuntos y tamaños separados por tabla/índice.

## Nuevas medidas locales

Cada sincronización agrega una fila diaria (sin IDs, rutas, cuerpos, nombres, firmas ni credenciales) en `cloud_sync_metrics.json`, al lado de SQLite. Se conservan 90 días. Registra solicitudes, reintentos, bytes de cuerpos HTTP, filas subidas/bajadas, duración y fallos; separa push REST, pull REST, subida a Storage y descarga de Storage. Las descargas de adjuntos bajo demanda se agregan al mismo día sin contar como sincronización. Si falla la escritura de métricas, la sincronización sigue su curso.

Los bytes reflejan el tamaño de los cuerpos HTTP preparados/recibidos en el runtime de Electron por intento. Los bytes enviados pueden sobrecontarse si el fallo ocurrió antes de transmitir el cuerpo; tampoco incluyen cabeceras/TLS ni equivalen a egress facturable. El panel de Supabase es la referencia del consumo de egress y Storage.

## Fotografia SQLite de esta fase

Medida en modo solo lectura con Electron sobre `data/farmacia.db`:

- Archivo: **946.176 bytes** (231 páginas × 4.096); WAL: **0 bytes**; SHM: **32.768 bytes**.
- Integridad: `ok`; violaciones FK: **0**; freelist: **0**; journal: `wal`.
- Filas SQLite: **2.811** contando la tabla `migrations`; **2.779** excluyendo esa tabla.
- `dbstat`: aprox. **421.888 bytes** en objetos clasificados como tablas, **483.328 bytes** en índices y **36.864 bytes** internos. La suma de objetos puede diferir del tamaño del archivo por el tratamiento de páginas reservadas/raíz.
- Firmas presentes: **349** entre `ordenes` y `entregas`, con **14.309 bytes** agregados y máximo **41 bytes** en esta copia de desarrollo. No hay adjuntos `documento_adjunto_data` no nulos. Estas firmas diminutas parecen datos de prueba y no estiman firmas reales.

Esto es una medición del SQLite de desarrollo; no indica tamaño, filas o adjuntos de PostgreSQL/Storage.

Las solicitudes GET/HEAD y los POST idempotentes del escritorio (upsert de `sync_records` y `x-upsert` de Storage) reintentan hasta dos veces ante fallos de red, 408, 429 o 5xx. El backoff es exponencial desde 500 ms, respeta `Retry-After` hasta 5 s y no reintenta errores 4xx restantes ni POST no idempotentes.

## Cómo medir

1. Ejecutar el diagnóstico SQLite con el runtime Electron que usa `better-sqlite3` y conservar la salida JSON con fecha:
   `$env:ELECTRON_RUN_AS_NODE = "1"; & ".\node_modules\electron\dist\electron.exe" scripts/diagnostico-sqlite.js; Remove-Item Env:ELECTRON_RUN_AS_NODE`
2. Ejecutar las consultas en [supabase-metrics.sql](supabase-metrics.sql) desde SQL Editor; exportar la salida sin incluir datos de filas.
3. Revisar en Dashboard → Organization → Usage los consumos de Database Size, Storage Size y egress. Database/API egress y Storage egress son categorías distintas. Para solicitudes y consultas, usar Logs Explorer del proyecto; no habilitar consultas frecuentes de sondeo.
4. Repetir semanalmente durante al menos 30 días y conservar los snapshots fuera de Supabase. El esquema actual sobrescribe el registro de cada ID; no permite reconstruir el crecimiento histórico mirando `synced_at`.
5. Usar los contadores locales diarios como volumen de payload generado por esta aplicación y contrastarlos con el Dashboard. No sumar cuotas de proyectos distintos como si fueran una base única.

## Alertas operativas

Aplicar revisión manual al 50 % de cada cuota, acordar una acción correctiva al 70 % y tratar el 85 % como estado crítico. Revisar Database Size, Storage Size y egress por separado en Usage. El escritorio no consulta la Management API ni envía sondeos de cuota, así que estos umbrales no generan notificación automática; los contadores locales miden la actividad de esta aplicación, no el consumo total de la organización/proyecto.

## Proyección

No se reportan proyecciones numéricas para 10.000, 25.000, 50.000 o 100.000 filas hasta obtener una muestra remota y snapshots de crecimiento. `sync_records` es una tabla de sobres JSON: calcular bytes medios por `table_name` por separado, distinguir auditoría y catálogos, sumar heap/índices/TOAST con `pg_total_relation_size`, y reportar Storage y egress como recursos aparte. Si los tipos de registro crecen a ritmos distintos, proyectarlos separadamente y sumar con el margen observado, no aplicar una regla de tres al tamaño SQLite.

Los límites Free publicados al preparar esta fase son: PostgreSQL 500 MB por proyecto, Storage 1 GB y egress 5 GB; los proyectos Free pueden entrar en solo lectura al superar el límite de base. Verificar la [página de cuotas](https://supabase.com/docs/guides/platform/billing-on-supabase) y la [guía de tamaño de base](https://supabase.com/docs/guides/platform/database-size) antes de tomar decisiones operativas.

## Oportunidades observadas y decisiones

- Tablas sin una columna temporal reconocida se vuelven a leer completas para push. No cambiar la selección hasta medir tablas afectadas y probar cómo se actualiza cada timestamp; un delta basado en fechas de negocio puede perder modificaciones.
- El pull pagina con `offset`; cambiarlo requiere staging para verificar paginación mientras cambian filas. Se conserva hasta tener mediciones y pruebas en staging.
- Upsert transmite el objeto completo cuando una fila cambia y no hay outbox duradera. No se cambia a parches parciales: el JSON actual y su semántica de conflicto no hacen seguro fusionarlos sin especificación.
- Firmas y documentos existen como Base64 local. Los grandes van a Storage, pero los pequeños siguen dentro del JSON. La huella se guarda como indicador, no como plantilla biométrica. No se migra ni elimina contenido.
- El escritorio usa `service_role` y no filtra por sede al descargar. Es un riesgo de aislamiento conocido de la fase previa y no se resuelve alterando métricas ni mediante filtrado local.

## Estado de validación

- **Verificado mediante código:** formatos de upsert, umbrales de adjuntos, límites de páginas, consultas de dashboard y ausencia de acceso remoto al proyecto en este entorno.
- **Verificado mediante medición local:** el diagnóstico SQLite se ejecutó en esta fase; los resultados están en la fotografía anterior.
- **Verificado mediante pruebas:** suite focalizada **35/35**; incluye contadores diarios, separación REST/Storage, retención de 90 días, reintentos transitorios, subida/bajada simuladas, bytes y cursor ante fallo.
- **Verificado mediante lint:** `npm run lint` finalizó con 0 errores y 42 advertencias preexistentes.
- **Pendiente de acceso:** métricas PostgreSQL, Storage, egress, consultas lentas y crecimiento del proyecto real.
- **Pendiente de staging:** aislamiento, concurrencia, offline prolongado, conflictos y cambio de paginación.
