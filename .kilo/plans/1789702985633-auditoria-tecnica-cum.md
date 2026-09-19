# Auditoría Técnica Exhaustiva — Sistema CUM (Farmacia-Control)

## Resumen Ejecutivo

Auditoría completa del sistema CUM (Catálogo INVIMA de Medicamentos) y componentes relacionados (respaldos, sync en nube, IPC, auth). Se identificaron **3 hallazgos críticos**, **5 de alta severidad**, **12 de media severidad** y **10 de baja severidad**. La arquitectura general (Electron + React + SQLite + IPC con sesión validada) es sólida, pero existen brechas de seguridad y calidad de código que deben abordarse.

---

## 1. Detección de Errores y Bugs

### [CRÍTICA] C3 — `headers()` en `cloudSyncService.js` usa variable mal nombrada
- **Archivo:** `backend/services/cloudSyncService.js:84-91`
- **Detalle:** La función `headers()` usa `SUPABASE_PUBLISHABLE_KEY`, pero en `supabaseConfig.js:14` esta variable exportada está aliasada a `SUPABASE_KEY = SUPABASE_SERVICE_ROLE_KEY || SUPABASE_PUBLISHABLE_KEY`. Si `SUPABASE_SERVICE_ROLE_KEY` está configurada, la **service role key** (capaz de bypassear RLS) se envía como `apikey` header. La variable debería diferenciarse claramente o usar nombres separados para el `apikey` (anon key) y el `Authorization` (service role).
- **Impacto:** Potencial exposición de credenciales de servicio si el código se reutiliza en contexto donde la service role no debería usarse.

### [ALTA] C2 — `fs.readdirSync` bloqueante en listado de backups
- **Archivo:** `backend/services/backupService.js:57`
- **Detalle:** `fs.readdirSync(dir)` es una llamada síncrona que bloquea el proceso principal de Electron. Con 55+ archivos de backup existentes, esto causa congelamiento temporal del UI.
- **Impacto:** UI se congela al abrir la página de Respaldos.

### [ALTA] C4 — Sin rate limiting en handlers IPC de actualización de catálogo
- **Archivo:** `backend/ipcHandlers.js:292`
- **Detalle:** El handler `catalogoCum:actualizar` no tiene protección contra llamadas concurrentes. Si se llama múltiples veces en paralelo, se crearían múltiples descargas INVIMA simultáneas, cada una con 120s de timeout, consumiendo memoria (acumulan `allData` en RAM) y ancho de banda.
- **Impacto:** DoS accidental del sistema local, consumo excesivo de recursos.

### [MEDIA] B1 — Hash `hash_fila` incompleto no detecta todos los cambios
- **Archivo:** `backend/services/catalogoCumService.js:25-38`
- **Detalle:** `generarHashFila` solo incluye 10 campos (expediente, consecutivocum, producto, principio_activo, concentracion, forma_farmaceutica, registro_sanitario, titular, laboratorio, estado_cum). Campos como `descripcioncomercial`, `via_administracion`, `unidad_medida`, `cantidad_presentacion`, fechas de vencimiento, GTINs, etc., no están incluidos. Si INVIMA actualiza esos campos sin cambiar los incluidos en el hash, el registro no se marcará como "actualizado".
- **Impacto:** Datos desactualizados silenciosamente.

### [MEDIA] B2 — Acumulación de memoria en `descargarCatalogoCompleto`
- **Archivo:** `backend/services/catalogoCumService.js:91-134`
- **Detalle:** `allData = allData.concat(chunk)` acumula todo el catálogo en memoria antes de procesar. El catálogo INVIMA puede tener 100K+ registros (~50MB+). Durante la descarga, toda la respuesta JSON vive en memoria.
- **Impacto:** Alto uso de memoria, posible OOM en máquinas con pocos recursos.

### [MEDIA] B3 — LIKE wildcards no escapados en búsqueda
- **Archivo:** `backend/services/catalogoCumService.js:543-561`
- **Detalle:** `const like = '%${texto}%'` interpola texto de usuario directamente en un patrón LIKE sin escapar `%` y `_`. Buscar "100%" o "par_acetamol" produciriría resultados inesperados.
- **Impacto:** Resultados de búsqueda incorrectos.

### [BAJA] C1 — Inconsistencia en formato de handlers IPC
- **Archivo:** `backend/ipcHandlers.js:231, 235, 292`
- **Detalle:** Algunos handlers omiten el primer parámetro `_event` (p. ej. `backups:crear` en línea 235) mientras otros lo incluyen como `(_event, ...)`. En `ipcMain.handle`, el primer argumento es siempre el evento. Al no declararlo, los argumentos restantes se desplazan, pero funciona porque los handlers son llamados con `(event, ...args)`. Es inconsistente y propenso a errores.

### [BAJA] C5 — Error de detalle de Supabase expuesto al usuario
- **Archivo:** `backend/services/cloudSyncService.js:103`
- **Detalle:** `throw new CloudSyncError(\`Supabase respondió ${res.status}: ${detalle}\`)` expone el cuerpo de error de Supabase (que puede incluir detalles de schema) al usuario final.
- **Impacto:** Posible fuga de información de implementación.

---

## 2. Seguridad

### [CRÍTICA] S1 — `obtenerDocumento` sin verificación de permisos
- **Archivo:** `backend/services/catalogoCumService.js:725-731`
- **Detalle:** La función `obtenerDocumento(cumId)` no verifica que el usuario tenga rol de admin. El controller (`catalogoCumController.js:75-82`) recibe `usuarioSesion` pero no lo pasa al servicio. El IPC handler (`ipcHandlers.js:324`) solo valida la sesión, no el rol. Cualquier usuario autenticado (INVENTARIO, USUARIO) puede retribuir documentos adjuntos (base64) de cualquier registro CUM.
- **Recomendación:** Agregar `permisoService.verificarEsAdmin(usuarioSesion)` en `obtenerDocumento` y pasar `usuarioSesion` desde el controller.

### [CRÍTICA] S2 — Service Role Key potencialmente en repositorio
- **Archivo:** `backend/config/supabaseConfig.js:6, .env.example`
- **Detalle:** El `.env` está en `.gitignore` (línea 6), lo cual es correcto. Sin embargo, el código no valida que `SUPABASE_SERVICE_ROLE_KEY` no sea enviada al renderer. El preload (`electron/preload.js`) no expone la key, pero si alguien agrega accidentalmente una llamada directa de `fetch` a Supabase desde el renderer, la key podría filtrarse.
- **Recomendación:** Añadir validación en build de producción: si `SUPABASE_SERVICE_ROLE_KEY` está definida, lanzar error si el código que la usa se ejecuta fuera del proceso main. El `contextIsolation: true` y `nodeIntegration: false` mitigan esto, pero conviene reforzar.

### [ALTA] S3 — Estado de sesión en memoria sin cleanup
- **Archivo:** `backend/services/sessionService.js:7-8`
- **Detalle:** El `Map` `sesiones` nunca se limpia automáticamente. Aunque el TTL se verifica al resolver (`Date.now() - sesion.creadoEn > TTL_MS`), las sesiones expiradas permanecen en memoria. En una app desktop con reinicios frecuentes este no es problema grave, pero es una fuga de memoria.
- **Recomendación:** Implementar un intervalo de limpieza periódica (ej. cada hora eliminar sesiones expiradas).

### [ALTA] S4 — Sin protección contra enumeración de usuarios
- **Archivo:** `backend/services/authService.js:67-100`
- **Detalle:** El login devuelve el mismo error ("Usuario o contraseña incorrectos") tanto para usuario inexistente como para password incorrecto. Esto es correcto para evitar enumeración. Sin embargo, `bcrypt.compareSync` (síncrono) es llamado incluso cuando el usuario no existe (devuelve `false`). Esto crea un timing oracle: si el usuario existe, hay un cálculo bcrypt de ~100ms; si no existe, la respuesta es instantánea. Un atacante puede diferenciar usuarios existentes vs no existentes por el timing.
- **Recomendación:** Realizar siempre un `bcrypt.compareSync` contra un hash dummy cuando el usuario no existe, para igualar el timing.

### [ALTA] S5 — Backup `restaurar` no verifica versión de migración
- **Archivo:** `backend/services/backupService.js:150-200`
- **Detalle:** La restauración copia el archivo de backup directamente sobre la base de datos activa sin verificar compatibilidad de esquema. Si se restaura un backup de una versión anterior que carece de columnas agregadas por migraciones posteriores (p. ej. `documento_adjunto_data`), al volver a arrancar, las migraciones pueden fallar o datos se comportarán de forma impredecible.
- **Recomendación:** Verificar la versión de migración del backup antes de restaurar, o requerir confirmación explícita.

### [ALTA] S6 — `crearEmpaque` interpola nombre de columna dinámicamente
- **Archivo:** `backend/services/catalogoCumService.js:663-666`
- **Detalle:** `const campoGtin = data.nivel === 1 ? 'gtin_empaque_logistico' : data.nivel === 2 ? 'gtin_empaque_venta' : 'gtin';` y luego `db.prepare(\`UPDATE catalogo_cum SET ${campoGtin} = ? WHERE id = ?\`)`. Aunque `nivel` es validado en el `CHECK` de la tabla empaques (1,2,3), no hay validación server-side en `crearEmpaque`. Si `nivel` es otro valor (p.ej. 0), `campoGtin` sería `'gtin'` por el fallback, lo cual es seguro pero no esperado. Es técnicamente seguro (no hay inyección porque el valor proviene de una comparación estricta), pero el patrón es propenso a futuras vulnerabilidades si se cambia la lógica.
- **Recomendación:** Validar `data.nivel` explícitamente contra [1,2,3] y lanzar error si no coincide.

### [MEDIA] S7 — Data URL para visualización de documentos
- **Archivo:** `src/pages/CatalogoCUM.jsx:277-284, 278`
- **Detalle:** Documentos se abren como `data:application/pdf;base64,...` o `data:image/*;base64,...` en ventanas nuevas. Aunque la CSP en producción es restrictiva, los data URLs pueden ser un vector de XSS en algunos navegadores si el contenido es manipulado.
- **Impacto:** Bajo, pero conviene mitigar usando un visor interno en lugar de `window.open`.

### [MEDIA] S8 — `conSyncDespuesDeCambio` dispara sync tras operaciones de catálogo
- **Archivo:** `backend/ipcHandlers.js:320-322`
- **Detalle:** El handler `catalogoCum:adjuntarDocumento` está envuelto con `conSyncDespuesDeCambio`, que llama a `sincronizarEnSegundoPlano`. Si Supabase no está configurado, esto falla silenciosamente en el debounce de 500ms. No es crítico, pero genera intentos fallidos en cada attach.
- **Recomendación:** Verificar `syncHabilitado` antes de disparar el sync.

### [BAJA] S9 — `password_hash` eliminado correctamente en sessionService
- **Archivo:** `backend/services/sessionService.js:44`
- **Detalle:** `const { password_hash, ...seguro } = usuario;` — correcto, elimina el hash antes de devolver el usuario al renderer. Verificado como seguro.

---

## 3. Exposición de Archivos y Datos

### [ALTA] E1 — 55+ backup files acumulados sin política de retención
- **Ubicación:** `data/backups/`
- **Detalle:** Se encontraron 55+ archivos `.db` de backup en `data/backups/`, muchos creados cada minuto durante el desarrollo (2026-09-12 con timestamps a minutos de distancia). Estos archivos contienen copias completas de la base de datos, incluyendo hashes de contraseñas, datos de pacientes, órdenes, etc. No hay política de retención, compresión ni encriptación.
- **Recomendación:** Implementar rotación de backups (max 10 archivos, eliminar los más antiguos), comprimir y/o encriptar backup files.

### [BAJA] E2 — `cloud_sync_state.json` expone timestamp de sync
- **Ubicación:** `data/cloud_sync_state.json`
- **Detalle:** Contiene `last_sync_timestamp`, `last_sync_direction`, `last_run_fin` y conteos de subidos/bajados. No contiene datos sensibles, pero es un archivo de estado al lado de la BD. Está en `.gitignore` (implícitamente por `*.json` no, pero `*.db` sí).
- **Recomendación:** Verificar que `cloud_sync_state.json` esté en `.gitignore` (actualmente solo `.env*`, `node_modules/`, `*.db`, `*.log`, `*.tmp`, `dist/`, `build/` están listados).

### [BAJA] E3 — `.env` en `.gitignore` pero `data/` no está excluida
- **Archivo:** `.gitignore`
- **Detalle:** El `.gitignore` incluye `*.db` pero no `*.sqlite` ni la carpeta `data/` completa. Archivos como `data/cloud_sync_state.json` y `backup_config.json` podrían ser comiteados accidentalmente.
- **Recomendación:** Añadir `data/` o específicamente `data/*.json` al `.gitignore`.

### [BAJA] E4 — CSP en desarrollo permite `unsafe-eval` y `unsafe-inline`
- **Archivo:** `electron/main.js:42-44`
- **Detalle:** En desarrollo, la CSP es `"default-src 'self' 'unsafe-inline' data:; script-src 'self' 'unsafe-inline' 'unsafe-eval'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self'; connect-src 'self' ws: http://localhost:5173; frame-ancestors 'none'; base-uri 'self'; form-action 'self'"`. El `unsafe-eval` es necesario para Vite HMR pero debilita la seguridad.
- **Impacto:** Solo en desarrollo, no afecta producción.

---

## 4. Optimización de Rendimiento

### [ALTA] P1 — Sin rate limiting en handlers IPC de actualización
*(Ver C4 arriba)*

### [MEDIA] P2 — Consulta `buscarPorProducto` con texto vacío trae todos los registros
- **Archivo:** `backend/services/catalogoCumService.js:543-561`
- **Detalle:** Cuando `texto` es vacío, devuelve `LIMIT ?` registros ordenados por `actualizado_en DESC`. Si el límite es 500, se traen 500 registros completos. La paginación se hace en frontend (`CatalogoCUM.jsx:111-116`). Cada búsqueda nueva recarga 500 registros completos.
- **Recomendación:** Implementar paginación server-side.

### [MEDIA] P3 — Polling de progreso cada 1 segundo
- **Archivo:** `src/pages/CatalogoCUM.jsx:126-133`
- **Detalle:** Mientras `actualizando` es true, se hace un `ipcRenderer.invoke` cada segundo para obtener progreso. Cada llamada pasa por `conValidacionSesion` y ejecuta `obtenerProgreso()`. Aunque es solo lectura de memoria, genera tráfico IPC innecesario.
- **Recomendación:** Usar `ipcRenderer.on` con eventos push en lugar de polling, o aumentar intervalo a 2-3 segundos.

### [BAJA] P4 — `fs.readdirSync` + `fs.statSync` en listado de backups
- **Archivo:** `backend/services/backupService.js:57-72`
- **Detalle:** Otro `fs.statSync` sincrónico por cada archivo (55+ archivos). Total: 56 llamadas síncronas.
- **Recomendación:** Usar versión async o cachear.

---

## 5. Calidad de Código

### [MEDIA] Q1 — `CatalogoCumError` no preserva stack trace
- **Archivo:** `backend/services/catalogoCumService.js:23`
- **Detalle:** `class CatalogoCumError extends Error {}` no captura el stack de error original. La convención ES6 recomienda `Error.captureStackTrace(this, this.constructor)` en el constructor.
- **Impacto:** Debugging más difícil.

### [MEDIA] Q2 — `conSyncDespuesDeCambio` asume `res.ok` para sync
- **Archivo:** `backend/ipcHandlers.js:44-46`
- **Detalle:** `if (!res || res.ok !== false) sincronizarEnSegundoPlano(nombre);` — esto dispara sync incluso cuando `res` es `null` o `undefined` (por ejemplo, si un handler retorna `undefined` en lugar de un objeto `{ok: ...}`). La convención `res.ok !== false` asume que todo lo que no es falso explícito es éxito.
- **Recomendación:** Verificar `res?.ok === true` antes de sync.

### [BAJA] Q3 — Mensajes de log hardcodeados con `console.log`
- **Archivo:** `backend/services/catalogoCumService.js:357, 361, 365, 394, 421, 426, 445, 458`
- **Detalle:** Múltiples `console.log` y `console.error` hardcodeados en lugar de un logger estructurado. Dificultan el debugging en producción.
- **Recomendación:** Usar un logger con niveles (debug/info/warn/error).

### [BAJA] Q4 — Nombres de constantes inconsistentes
- **Archivo:** `backend/config/supabaseConfig.js:14`
- **Detalle:** `SUPABASE_PUBLISHABLE_KEY: SUPABASE_KEY` — el export está enmascarado. `cloudSyncService.js:5` importa `SUPABASE_PUBLISHABLE_KEY` pero recibe la service role key. Confuso para desarrolladores futuros.
- **Recomendación:** Renombrar a `SUPABASE_AUTH_KEY` o exponer dos constantes separadas.

### [BAJA] Q5 — No hay validación de `cantidad_presentacion` como número
- **Archivo:** `backend/services/catalogoCumService.js:181`
- **Detalle:** `cantidad_presentacion REAL` en SQL, pero en `mapearRegistroINVIMA` se hace `Number(item.cantidadcum)`. Si el valor de INVIMA no es numérico, resulta en `NaN` que SQLite almacena como `NULL` implícitamente (o como texto). No hay validación.
- **Recomendación:** Validar que el número sea finito.

### [BAJA] Q6 — `handleVerDocumento` abre data URL con `window.open`
- **Archivo:** `src/pages/CatalogoCUM.jsx:273-288`
- **Detalle:** La función abre data URLs en nuevas ventanas. Si `base64` está corrupto o vacío, `data:` URL podría mostrar contenido inesperado.
- **Recomendación:** Validar antes de abrir; usar un visor interno.

---

## Tabla de Hallazgos por Severidad

| # | Severidad | Archivo | Línea(s) | Descripción |
|---|-----------|---------|----------|-------------|
| S1 | Crítica | `catalogoCumService.js` | 725-731 | `obtenerDocumento` sin verificación de permisos de admin |
| S2 | Crítica | `supabaseConfig.js` | 6,14 | Service role key mal nombrada/expuesta |
| S3 | Alta | `sessionService.js` | 7-8 | Map de sesiones sin cleanup de expiradas |
| S4 | Alta | `authService.js` | 67-100 | Timing oracle en login |
| S5 | Alta | `backupService.js` | 150-200 | No verifica versión de migración al restaurar |
| S6 | Alta | `catalogoCumService.js` | 663-666 | Interpolación de nombre de columna dinámica |
| S7 | Media | `CatalogoCUM.jsx` | 277-284 | Data URL para visualización de documentos |
| S8 | Media | `ipcHandlers.js` | 320-322 | Sync disparado sin verificar `syncHabilitado` |
| S9 | Baja | `sessionService.js` | 44 | password_hash correctamente eliminado |
| E1 | Alta | `data/backups/` | — | 55+ backups sin política de retención |
| E2 | Baja | `data/cloud_sync_state.json` | — | Archivo de estado expuesto |
| E3 | Baja | `.gitignore` | — | `.env` listado pero `data/` no |
| E4 | Baja | `main.js` | 42-44 | CSP de desarrollo con `unsafe-eval` |
| P1 | Alta | `ipcHandlers.js` | 292 | Sin rate limiting en `catalogoCum:actualizar` |
| P2 | Media | `catalogoCumService.js` | 543-561 | Sin paginación server-side en `buscarPorProducto` |
| P3 | Media | `CatalogoCUM.jsx` | 126-133 | Polling de progreso cada 1s innecesario |
| P4 | Baja | `backupService.js` | 57-72 | `fs.readdirSync`/`statSync` bloqueantes |
| C3 | Crítica | `cloudSyncService.js` | 84-91 | `headers()` usa variable mal nombrada |
| B1 | Media | `catalogoCumService.js` | 25-38 | `hash_fila` incompleto |
| B2 | Media | `catalogoCumService.js` | 91-134 | Acumulación de memoria en descarga |
| B3 | Media | `catalogoCumService.js` | 543-561 | LIKE wildcards no escapados |
| C1 | Baja | `ipcHandlers.js` | 231,235,292 | Inconsistencia en formato de handlers |
| C5 | Baja | `cloudSyncService.js` | 103 | Error de Supabase expuesto al usuario |
| Q1 | Media | `catalogoCumService.js` | 23 | `CatalogoCumError` no preserva stack |
| Q2 | Media | `ipcHandlers.js` | 44-46 | `conSyncDespuesDeCambio` asume éxito |
| Q3 | Baja | `catalogoCumService.js` | 357+ | `console.log` en lugar de logger |
| Q4 | Baja | `supabaseConfig.js` | 14 | Nombres de constantes inconsistentes |
| Q5 | Baja | `catalogoCumService.js` | 181 | Sin validación de `Number()` en cantidad_presentación |
| Q6 | Baja | `CatalogoCUM.jsx` | 273-288 | `window.open` con data URL |

---

## Recomendaciones Prioritarias

1. **[Crítica] Agregar verificación de admin en `obtenerDocumento`** — Pasar `usuarioSesion` al service y validar rol.
2. **[Crítica] Renombrar/clarificar constantes de Supabase** — Separar `SUPABASE_ANON_KEY` de `SUPABASE_SERVICE_ROLE_KEY`.
3. **[Alta] Agregar rate limiting a `catalogoCum:actualizar`** — Usar un flag como `actualizacionEnProgreso` para prevenir llamadas concurrentes.
4. **[Alta] Migrar `fs.readdirSync`/`statSync` a async** en backupService.
5. **[Media] Escapar wildcards en LIKE** — Agregar `texto.replace(/%/g, '\\%').replace(/_/g, '\\_')` antes del `LIKE`.
6. **[Media] Ampliar campos en `generarHashFila`** para incluir todos los campos que pueden cambiar.
7. **[Baja] Añadir `data/` al `.gitignore`** y crear política de retención de backups.
