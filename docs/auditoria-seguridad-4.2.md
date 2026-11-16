# Auditoría de seguridad — Etapa 4.2

**Rama:** `fix/auditoria-pr3`
**Fecha:** 2026-11-14 (auditoría) / 2026-11-15 (corrección)
**Alcance:** validación en Electron 32 real de las correcciones de la Etapa 4.1:
IPC y preload, roles, documentos adjuntos, respaldos, CSP, navegación, ventanas,
permisos, `webview`, `contextIsolation`/`sandbox` y saneamiento de errores.
**Restricciones respetadas:** sin acceso a producción, sin cambios en `main`, sin
commits/PR, sin actualizar Electron, sin modificar migraciones/esquema, sin
ejecutar `rebuild:node` y conservando los permisos actuales de SUPERADMIN,
ADMIN, INVENTARIO y USUARIO.

> **Estado global: HALLAZGOS V-4.2-01, V-4.2-02 Y V-4.2-03 CORREGIDOS Y
> VERIFICADOS POR PRUEBAS.** La auditoría de cierre del 2026-11-15 identificó
> hallazgos adicionales (`AC-4.2-01` a `AC-4.2-12`) que se documentan en
> [`docs/auditoria-cierre-4.2.md`](auditoria-cierre-4.2.md). La Etapa 4.2
> **sigue sin declararse cerrada ni aprobada** hasta resolverlos o aceptarlos
> formalmente y completar las tres verificaciones manuales de la sección 8.
> El único fallo de la suite completa sigue siendo el preexistente
> `tests/unit/release_payload.test.js`.

---

## 1. Resumen ejecutivo

La auditoría original encontró tres defectos en el flujo de respaldos y en los
mensajes de adjuntos de órdenes:

| ID | Severidad | Estado | Resumen |
|---|---|---|---|
| `V-4.2-01` | Alta | **Resuelto** | La restauración aceptaba una SQLite ajena con nombre válido y reemplazaba la base activa. |
| `V-4.2-02` | Media | **Resuelto** | La restauración exitosa no reiniciaba la app porque no se esperaba la promesa. |
| `V-4.2-03` | Baja | **Resuelto** | Los rechazos de adjuntos de órdenes mostraban un error genérico en vez del mensaje de política. |

Correcciones principales:

- **Respaldo autenticado:** cada respaldo nuevo tiene un manifiesto lateral
  `*.manifest.json` firmado con HMAC-SHA256. La clave vive fuera de la carpeta
  de respaldos. La restauración valida firma, nombre, tamaño, SHA-256, tablas
  requeridas, migraciones aplicadas, huella de esquema y `user_version` antes de
  tocar la base activa.
- **Promoción segura:** la auditoría de éxito se escribe en el staging antes de
  promover. Si falla cualquier paso, se hace rollback y se conserva la base
  anterior. La copia previa queda como `.promoted-old.db`.
- **Reinicio correcto:** el handler IPC espera la promesa real y solo reinicia
  cuando la restauración responde `ok:true`. Si falla, no reinicia.
- **Mensajes funcionales:** `DocumentoInvalidoError` se traduce en el
  controlador de órdenes; el operador ve extensión, MIME, tamaño o formato, sin
  rutas ni detalles internos.
- **Política de respaldos legacy:** un `.db` sin manifiesto auténtico ya no es
  restaurable. Se muestra como `No restaurable` en la UI y se conserva solo como
  archivo histórico. Es un cambio deliberado de política, documentado en la
  sección 6.

Resultados de verificación:

- **12/12** pruebas nuevas de restauración y reinicio.
- **9/9** pruebas nuevas de mensajes de adjuntos.
- **34/34** pruebas relacionadas de IPC y `startupRecovery`.
- **Suite completa:** 324 pruebas, 323 pasan, 1 falla preexistente
  (`release_payload`).
- **Arnés Electron real:** 4 escenarios ejecutados; restauración válida con
  `relaunch=1`/`exit=1`, archivo ajeno y corrupto con `relaunch=0`/`exit=0` y
  base activa intacta.
- **ESLint:** 0 errores y 0 warnings.
- **`pnpm audit --prod`:** sin vulnerabilidades conocidas.
- **`git diff --check`:** exit 0; solo avisos de conversión LF→CRLF.
- **`data/farmacia.db`:** hash y `mtime` sin cambios.

---

## 2. Entorno y aislamiento

### 2.1 Versiones

| Componente | Versión |
|---|---|
| Electron | 32.3.3 (ABI 128) |
| `better-sqlite3` | 11.10.0 |
| Node CLI de scripts auxiliares | 22.22.3 |
| pnpm | 11.25.0 (`corepack pnpm`) |

No se ejecutó `pnpm run rebuild:node`. Las pruebas que tocan SQLite corrieron bajo
el binario de Electron, por lo que `better-sqlite3` conservó la compilación para
Electron 32.

### 2.2 Base de datos

- Cada escenario usó una ruta absoluta distinta bajo
  `%TEMP%\farmacia-etapa42\...`, pasada mediante `FARMACIA_TEST_DB_PATH`.
- Se ejecutó con `NODE_ENV=test`; `electron/main.js` omite los planificadores de
  respaldos, sincronización y HTTP en ese modo.
- El arnés aisló `app.setPath('userData', ...)`, la carpeta de respaldos y la
  clave de firma con `backupService.setDirectorioRespaldos(...)` y
  `backupService.setClaveManifiestoPath(...)`.
- La app real se lanzó con `--user-data-dir=...` dentro de `%TEMP%`.
- `data/farmacia.db` conservó el hash
  `5A9093839ED8C6F19486D7111990D126E6A90EA37CAB20223520753F351CEF41`
  y su `mtime` del 13/11/2026 17:25. No fue abierta, reemplazada ni modificada
  por las pruebas de restauración.
- `data/backup_config.json` y `data/cloud_sync_state.json` ya estaban modificados
  antes de esta continuación; no forman parte del cambio.

### 2.3 Arnés de integración

Archivos en `tests/e2e/electron-real/`:

| Archivo | Función |
|---|---|
| `main_harness.js` | Arranca Electron real, prepara la BD aislada, registra handlers reales y ejecuta el escenario. |
| `harness-preload.js` | Preload solo de prueba; añade `window.__harness` sin tocar el preload de producción. |
| `ipc_tests.js` | Frame principal, saneamiento, documentos y nombres de respaldo inválidos. |
| `iframe_tests.js` | Iframe con `nodeIntegrationInSubFrames:true` y preload forzado. |
| `external_tests.js` | Ventana cargada desde un origen HTTP local no autorizado. |
| `restore_tests.js` | Restauración válida, archivo ajeno y archivo corrupto. |
| `run_harness.ps1` | Ejecuta los cuatro escenarios con carpetas temporales nuevas. |
| `redirect_dev_test.ps1` | Prueba `will-redirect` en una copia aislada en modo desarrollo. |
| `README.md` | Instrucciones de reproducción. |

El `app` y el `shell` inyectados en `registerIpcHandlers` son dobles de prueba:
capturan `relaunch()`/`exit()` y `shell.openPath()` en lugar de reiniciar Electron
o abrir el visor del sistema. La lógica de negocio, el preload y el renderer son
los reales.

---

## 3. Resultados de la auditoría original

### 3.1 IPC y validación del remitente

| Comprobación | Resultado | Evidencia |
|---|---|---|
| Frame principal: `senderFrame === sender.mainFrame` | **APROBADO** | `sameRef:true`, `routingId` 1/1, `processId` 4/4. |
| Canal envuelto por la política desde el frame principal | **APROBADO** | `harness:protegido` devuelve la identidad del frame principal. |
| Canal real desde el frame principal | **APROBADO** | `api.sedes.listar(s)` responde `ok:true`. |
| Iframe con preload forzado | **APROBADO** | `sameRef:false`, `senderFrame.routingId:4`, `mainFrame.routingId:1`, `senderFrame.url:about:srcdoc`; los canales responden `Origen no autorizado.` |
| Origen HTTP externo | **APROBADO** | `sameRef:true`, pero los canales responden `Origen no autorizado.` |
| Fallback por `routingId`/`processId` | **NO REQUERIDO** | La comparación directa de frames funciona en Electron 32; no se implementó ni se necesitó. |

Nota: en producción el iframe no recibe preload (`nodeIntegrationInSubFrames` es
`false`), por lo que `window.api` es `undefined` dentro del iframe. El arnés
probó el peor caso (`true`) y aun así el IPC rechazó el frame.

Evidencia: `%TEMP%\farmacia-etapa42\harness-ipc3\result.json` y
`%TEMP%\farmacia-etapa42\harness-20261114-173240\ipc\result.json`.

### 3.2 Saneamiento de errores

| Caso | Respuesta al renderer | Resultado |
|---|---|---|
| Error lanzado con ruta `C:\secreto\farmacia.db` | `Error interno. Intente nuevamente.` | **APROBADO** |
| Respuesta controlada `{ok:false}` con `SqliteError` y ruta | `Error interno. Intente nuevamente.` | **APROBADO** |
| Error `SQLITE_CORRUPT` | `Error interno. Intente nuevamente.` | **APROBADO** |

El detalle crudo solo queda en el log del proceso main. No se observó ninguna
ruta, nombre de tabla ni mensaje de SQLite en las respuestas IPC.

Evidencia: `harness-ipc3/result.json`, bloque `resultadoPrincipal.errores` y
`logs`.

### 3.3 Matriz de roles

Se ejecutó con las cuentas reales del seed y una cuenta ADMIN/USUARIO creada en
la BD aislada. No se modificaron permisos.

| Rol | `sedes:listar` | `sedes:crear` | `puentes:verificarPrerrequisitos` | Inventario/órdenes/despachos | Usuarios | Respaldos | CUM |
|---|---|---|---|---|---|---|---|
| SUPERADMIN | Todas (1, 2, 3) | Permitido | Permitido | Validación de negocio | Permitido | Permitido | Permitido |
| ADMIN | Solo sede 2 | Denegado | Permitido | Inventario/despacho denegados; órdenes pasan permiso y fallan validación | Denegado | Permitido (solo su sede) | Permitido |
| INVENTARIO | Solo sede 2 | Denegado | Permitido | Pasan permiso y fallan validación de negocio | Denegado | Denegado | Denegado |
| USUARIO | Solo sede 2 | Denegado | Permitido | Denegados | Denegado | Denegado | Denegado |

Comprobaciones adicionales:

| Caso | Resultado |
|---|---|
| `sedes:listar(null)` | **APROBADO**: `Sesión de usuario inválida.` |
| `sedes:crear(null, ...)` | **APROBADO**: `Sesión de usuario inválida.` |
| `puentes:verificarPrerrequisitos(null)` | **APROBADO**: `Sesión de usuario inválida.` |
| Token falso en `sedes:listar` | **APROBADO**: `Sesión expirada o inválida. Inicie sesión de nuevo.` |
| Token falso en `puentes` | **APROBADO**: `Sesión expirada o inválida. Inicie sesión de nuevo.` |

La creación de sede de SUPERADMIN se hizo en la BD aislada. No se tocó
`data/farmacia.db`.

Observación: `puentes:verificarPrerrequisitos` sigue disponible para USUARIO.
Es el comportamiento actual y no se modificó; se recomienda revisarlo en una
etapa de producto, no en esta auditoría.

Evidencia: `%TEMP%\farmacia-etapa42\real-app\security-result.json`, bloque
`roles` y `sesion`.

### 3.4 Documentos adjuntos

#### Catálogo CUM (app real y arnés)

| Caso | Resultado | Respuesta |
|---|---|---|
| PDF real adjuntado y abierto | **APROBADO** | `ok:true`; ruta `...\farmacia-doc-*\documento.pdf`; solo `{abierto,nombre,tipo}`. |
| PNG 1×1 real adjuntado y abierto (arnés) | **APROBADO** | `ok:true`; ruta `...\farmacia-doc-*\documento.png` (70 bytes); solo `{abierto,nombre,tipo}`. |
| PNG con cabecera PNG adjuntado (app real) | **APROBADO** | `ok:true`; la app real aceptó el archivo con firma PNG. |
| PDF con extensión/tipo imagen | **APROBADO** | `El tipo del documento no coincide con su contenido.` |
| PNG con extensión/tipo PDF | **APROBADO** | `El tipo del documento no coincide con su contenido.` |
| SVG con extensión/tipo PDF | **APROBADO** | `El documento debe ser un PDF o una imagen PNG, JPEG, GIF o WebP.` |
| Nombre `../fuera.pdf` | **APROBADO** | `El nombre del documento contiene caracteres no permitidos.` |
| Base64 inválido | **APROBADO** | `El documento no está codificado en base64 válido.` |
| Archivo de más de 10 MB | **APROBADO** | `El documento supera el tamaño máximo permitido (10 MB).` |
| ID manipulado (`'1 OR 1=1'`) en `mostrarDocumento` | **APROBADO** | `Registro CUM inválido.` |
| `obtenerDocumento` | **APROBADO** | Devuelve solo nombre, data y tipo; `contieneRuta:false`. |
| Fila manipulada en BD (`../evil.pdf` + SVG) y apertura posterior | **APROBADO** | La política rechaza el documento y no se produce una nueva llamada a `shell`. |

El nombre temporal lo genera el main; el nombre original nunca se usa como ruta.
Los archivos creados en el arnés fueron `documento.pdf` (35 bytes) y
`documento.png` (70 bytes) dentro de directorios `farmacia-doc-*`.

#### Adjuntos de órdenes (antes de la corrección)

| Caso | Resultado | Respuesta original |
|---|---|---|
| PDF válido con data URL correcta | **APROBADO** | Pasa la validación de documento; falla después por falta de stock. |
| PDF con MIME `image/png` | **APROBADO** (rechazo) | `Error interno. Intente nuevamente.` |
| PNG con MIME `application/pdf` | **APROBADO** (rechazo) | `Error interno. Intente nuevamente.` |
| PDF con MIME `text/html` | **APROBADO** (rechazo) | `Error interno. Intente nuevamente.` |
| Data URL sin `;base64` | **APROBADO** (rechazo) | `Error interno. Intente nuevamente.` |

El rechazo era correcto; el mensaje genérico era el hallazgo `V-4.2-03`, ya
corregido en la sección 4.3.

#### Verificación manual pendiente

- **NO EJECUTADO:** confirmar visualmente que el visor del sistema abre el PDF y
  el PNG. El arnés intercepta `shell.openPath` y la app real no se inspeccionó
  visualmente. La ruta temporal y la respuesta IPC sí quedaron verificadas.

Evidencia: `harness-ipc3/result.json` (`resultadoPrincipal.documentos`),
`real-app/security-result.json` (`documentos`) y
`real-app/ordenes-result.json`.

### 3.5 Protecciones de Electron

| Comprobación | Resultado | Evidencia |
|---|---|---|
| `contextIsolation:true` | **APROBADO** | `getLastWebPreferences()` en la ventana real. |
| `sandbox:true` | **APROBADO** | Idem. |
| `nodeIntegration:false` | **APROBADO** | Idem; `require`, `process` y `module` son `undefined` en el renderer. |
| `nodeIntegrationInSubFrames:false` | **APROBADO** | Idem. |
| `webviewTag:false` | **APROBADO** | Idem. |
| `webSecurity:true` / `allowRunningInsecureContent:false` | **APROBADO** | Idem. |
| API expuesta congelada | **APROBADO** | `Object.isFrozen(window.api)` y `Object.isFrozen(window.api.auth)` son `true`. |
| CSP: script inline | **APROBADO** | `window.__csp42` queda en 0; violación `script-src-elem` con `blocked:inline`. |
| CSP: `fetch` externo | **APROBADO** | Violación `connect-src`; `fetch` falla con `TypeError:Failed to fetch`. |
| Navegación a `https://example.com/` | **APROBADO** | La URL sigue siendo el `index.html` empaquetado. |
| Redirección HTTP 302 a HTTPS | **APROBADO** | En copia aislada en modo desarrollo: `[main] Navegación bloqueada: https://example.com/`. |
| `window.open` a `http`, `https`, `javascript:`, `data:`, `file:` | **APROBADO** (bloqueo) | Todos devuelven `null`; no se creó una segunda pestaña/CDP target. |
| Apertura externa HTTPS real | **NO EJECUTADO** | El handler invoca `shell.openExternal`, pero no se observó el navegador del sistema. Ver verificación manual. |
| Permiso de geolocalización | **APROBADO** | `denied`. |
| Permiso de notificaciones | **APROBADO** | `denied`. |
| Permiso de cámara/micrófono | **APROBADO** | `NotAllowedError:Permission denied`. |
| `<webview>` | **APROBADO** | Es un `HTMLElement` sin `loadURL` ni `getURL`; `webviewTag` está desactivado. |
| Iframe de producción | **APROBADO** | `window.api` es `undefined` dentro del iframe. |

La CSP y las protecciones se probaron en la app de producción empaquetada
(`dist/renderer/index.html`). La prueba de redirección usó una copia del proyecto
en modo desarrollo porque en producción el renderer solo carga el archivo exacto
y un redirect HTTP no es alcanzable; aun así ejercita el mismo handler
`will-redirect` de `electron/main.js`.

Evidencia: `real-app/security-result.json`, `harness-ipc3/result.json` y
`%TEMP%\farmacia-etapa42\redirect-20261114-173345\app-err.log`.

---

## 4. Hallazgos corregidos

### 4.1 V-4.2-01 — Restauración acepta una SQLite ajena y reemplaza la base activa

**Severidad:** Alta
**Estado:** **Resuelto**
**Archivos principales:** `backend/services/backupManifest.js` (nuevo),
`backend/services/backupService.js`,
`backend/database/startupRecovery.js`,
`backend/repositories/auditoriaRepository.js`,
`src/pages/Respaldos.jsx`.

#### Causa raíz

1. `backupService.restaurar` validaba el **nombre** con
   `PATRON_NOMBRE_RESPALDO`, pero no el contenido ni la procedencia del archivo.
2. `restoreDatabase` llamaba a
   `validateDatabase(sourceBackupPath, { requireComplete:false, fullIntegrity:true })`.
   `fullIntegrity` comprueba la integridad física de SQLite, pero
   `requireComplete:false` permite un archivo válido sin el esquema de la app.
3. La promoción se ejecutaba antes de la auditoría de éxito. Si la tabla
   `auditoria` no existía, la escritura fallaba después de reemplazar la base y
   el controlador devolvía un error saneado, pero la base ya había cambiado.
4. No había rollback automático para el fallo posterior a la promoción.

#### Corrección aplicada

**Manifiesto autenticado y clave local**

- Cada respaldo nuevo genera `${respaldo.db}.manifest.json` con:
  `formato`, `tipo`, `nombre`, `sha256`, `tamanoBytes`, `creadoEn`, `automatico`,
  `alcance` (`GLOBAL`/`SEDE`), `sedeId`, `sedeNombre`, `esquema.migraciones`,
  `esquema.sha256`, `esquema.userVersion`, `claveId` y `hmac`.
- El manifiesto se firma con HMAC-SHA256 sobre una serialización canónica.
- La clave de 32 bytes vive fuera de `backups/`:
  - En Electron: `userData/backup-signing.key.bin`, cifrada con `safeStorage`.
  - En pruebas/arnés: override explícito con clave cruda en un directorio temporal.
- Sin clave válida, la restauración falla cerrada. Un `.db` sin manifiesto no es
  restaurable.
- El `.db` sigue siendo una SQLite estándar; el manifiesto solo añade procedencia
  e integridad.

**Validación antes de tocar la base activa**

`validarContenidoRespaldo` verifica, en este orden:

1. Que el `.db` exista, sea archivo regular y no tenga `-wal`/`-shm` con datos.
2. Que el tamaño coincida con el manifiesto.
3. Que el SHA-256 coincida con el manifiesto.
4. `integrity_check` y `foreign_key_check` completos.
5. Existencia de las tablas requeridas (`auditoria`, `usuarios`, `sedes`,
   `migrations`, inventario, órdenes, etc.).
6. Que las migraciones aplicadas coincidan exactamente con las firmadas.
7. Que la huella del esquema coincida con la firmada.
8. Que `user_version` coincida con el manifiesto.

Solo después se pausa la sincronización y se llama a `restoreDatabase`.

**Promoción segura y auditoría previa**

- `restoreDatabase` fija el hash esperado antes de copiar, valida el origen y el
  staging, y vuelve a comprobar el hash antes de copiar.
- La auditoría de éxito se escribe **en el staging** antes de promover. Si esa
  escritura falla, no se sustituye la base activa.
- `auditoriaRepository.registrarConConexion(db, datos)` permite escribir en la
  conexión del staging sin depender de la conexión global.
- Después de la auditoría se eliminan companions vacíos, se sincroniza el
  archivo, se recalcula el hash de staging y se valida otra vez.
- El rollback cubre también los estados `PROMOTING` y `CURSOR_RESET`, no solo
  fallos anteriores a la promoción.
- La copia de la base anterior se conserva como
  `.startup-recovery-<id>.promoted-old.db`.
- Si la restauración falla antes de promover, la base activa queda intacta. Si
  falla después, se promueve de vuelta la copia previa y se restaura el cursor.

**Creación de respaldos**

- Después de `db.backup()` se consolida la copia con
  `journal_mode = DELETE`; si queda un `-wal` con contenido, el respaldo se
  descarta. Esto evita firmar una copia que no sea autónoma.
- Si falla la firma, la integridad o la consolidación, se elimina el `.db` y su
  manifiesto, se audita el fallo y se informa sin exponer detalles internos.
- `listar` solo marca `restaurable:true` cuando el manifiesto verifica. Un ADMIN
  solo ve respaldos `SEDE` de su propia sede; los globales siguen siendo
  exclusivos de SUPERADMIN.

**UI**

- Los respaldos sin manifiesto muestran `No restaurable`, el motivo y el botón
  deshabilitado. No se ofrece una acción destructiva sobre un archivo no
  autenticado.

#### Pruebas de regresión

`tests/security/backup_restore_security.test.js` cubre:

1. Respaldo válido restaurado, datos del respaldo presentes, copia previa
   conservada, auditoría de éxito y listado restaurable.
2. Rol sin acceso rechazado y tentativa auditada como `SIN_PERMISO`.
3. SQLite ajena sin manifiesto rechazada; base activa y tablas intactas.
4. Respaldo auténtico corrompido rechazado por huella; base activa intacta.
5. Manifiesto re-firmado con un esquema incompatible rechazado; base activa
   intacta.
6. ADMIN solo restaura respaldos `SEDE` de su sede; el global sigue bloqueado.
7. Firma imposible: el `.db` se descarta y no queda un archivo sin manifiesto.
8. Respaldo legacy sin manifiesto visible como no restaurable para SUPERADMIN.
9. Fallo de `beforePromote` (auditoría) no sustituye la base activa.
10. Fallo después de promover ejecuta rollback con el hash original exacto.
11. Restauración exitosa vía IPC: espera la promesa y reinicia una vez.
12. Validación rechazada vía IPC: no reinicia y conserva la base activa.

#### Evidencia

- `tests/security/backup_restore_security.test.js`: **12/12**, 3 suites, 0 fallos.
- `tests/ipc/ipc_handlers.test.js` + `tests/database/startupRecovery.test.js`:
  **34/34**, 0 fallos.
- Arnés real `%TEMP%\farmacia-etapa42\harness-20261115-100542\`:
  - `restore-valid`: `relaunchLlamado=1`, `exitLlamado=1`, marcador `1 → 0`,
    `auditoriaRestauracionExitosa=1`, 38 tablas.
  - `restore-foreign`: rechazo por manifiesto, `relaunch=0`, `exit=0`,
    `marcadorAjeno=0`, 38 tablas.
  - `restore-corrupt`: rechazo por huella, `relaunch=0`, `exit=0`, `sedes=3`,
    tablas intactas.

### 4.2 V-4.2-02 — La restauración exitosa no reinicia la aplicación

**Severidad:** Media
**Estado:** **Resuelto**
**Archivo:** `backend/ipcHandlers.js`

#### Causa raíz

El handler hacía:

```js
const resultado = backupController.restaurar(usuarioSesion, nombreArchivo);
if (resultado.ok) {
  app.relaunch();
  app.exit(0);
}
```

`backupController.restaurar` es async y devuelve una Promise. `resultado.ok` era
`undefined`, así que el reinicio nunca se ejecutaba. Además, el handler estaba
envuelto en `conSyncDespuesDeCambio`, lo que disparaba una sincronización no
deseada después de restaurar.

#### Corrección aplicada

- El handler ahora es `async` y hace
  `const resultado = await backupController.restaurar(...)`.
- Solo programa `app.relaunch()`/`app.exit(0)` si `resultado?.ok === true`.
- Se eliminó `conSyncDespuesDeCambio` de `backups:restaurar`: restaurar no debe
  disparar sincronización.
- La respuesta IPC se devuelve antes del reinicio, con un margen de 300 ms.
- Si la restauración falla, no se reinicia.

#### Pruebas de regresión

- `tests/security/backup_restore_security.test.js`:
  - éxito: `relaunch=1`, `exit=1`;
  - rechazo: `relaunch=0`, `exit=0`, base activa intacta.
- Arnés Electron real: `restore-valid` con `relaunchLlamado=1`/`exitLlamado=1`;
  `restore-foreign` y `restore-corrupt` con ambos contadores en 0.

### 4.3 V-4.2-03 — Errores de validación de adjuntos de órdenes se muestran como error interno

**Severidad:** Baja
**Estado:** **Resuelto**
**Archivos:** `backend/controllers/ordenController.js`,
`shared/documentPolicy.js` (sin cambios de política).

#### Causa raíz

`ordenController.manejarError` solo traducía `ValidationError` y `PermisoError`.
El rechazo de documentos lanza `DocumentoInvalidoError`, que caía en el mensaje
genérico `Error interno. Intente nuevamente.`.

#### Corrección aplicada

- `manejarError` mapea `DocumentoInvalidoError` a `{ ok:false, error: err.message }`.
- Se mantiene el saneamiento de errores del IPC: no se exponen rutas, SQL ni
  detalles internos.
- La política de documentos no se relajó: sigue validando firma binaria, MIME,
  base64, nombre y tamaño.

Mensajes que ahora recibe el operador:

| Caso | Mensaje |
|---|---|
| PDF con MIME `image/png` | `El tipo del documento no coincide con su contenido.` |
| PNG con MIME `application/pdf` | `El tipo del documento no coincide con su contenido.` |
| PDF con MIME `text/html` | `El tipo del documento no coincide con su contenido.` |
| Data URL sin `;base64` | `El documento debe adjuntarse como data URL base64.` |
| SVG o formato no permitido | `El documento debe ser un PDF o una imagen PNG, JPEG, GIF o WebP.` |
| Más de 10 MB | `El documento supera el tamaño máximo permitido (10 MB).` |
| Nombre con `../` o caracteres prohibidos | `El nombre del documento contiene caracteres no permitidos.` |

#### Pruebas de regresión

`tests/security/orden_documentos.test.js`: **9/9**, 0 fallos. Cubre los cuatro
casos de MIME/data URL, SVG, tamaño excedido, ausencia de creación de la orden,
PDF válido e imagen PNG válida.

---

## 5. Pruebas y verificación

### 5.1 Pruebas nuevas y relacionadas

| Archivo | Pruebas | Resultado | Cobertura |
|---|---:|---|---|
| `tests/security/backup_restore_security.test.js` | 12 | **12/12** | Restauración autenticada, rechazos, auditoría, rollback, reinicio. |
| `tests/security/orden_documentos.test.js` | 9 | **9/9** | Mensajes específicos y regresión de controles de adjuntos. |
| `tests/ipc/ipc_handlers.test.js` | 22 | **22/22** | IPC de respaldos y respuestas serializables. |
| `tests/database/startupRecovery.test.js` | 12 | **12/12** | Promoción, validación y recuperación. |

Las pruebas de restauración usan SQLite aislada en `%TEMP%` y una clave HMAC en
un directorio temporal separado. Nunca abren ni sustituyen `data/farmacia.db`.

### 5.2 Suite completa

```text
# tests 324
# suites 36
# pass 323
# fail 1
```

El único fallo es el preexistente `tests/unit/release_payload.test.js`:
la prueba espera `dist/**/*` en `package.json#build.files`, pero el árbol actual
tiene `dist/renderer/**/*`. No se modificó el empaquetado ni la prueba porque es
ajeno a la Etapa 4.2. Se reproduce igual que en la línea base.

### 5.3 Arnés Electron real

Comando:

```powershell
.\tests\e2e\electron-real\run_harness.ps1
```

Resultado de la corrida `%TEMP%\farmacia-etapa42\harness-20261115-100542\`:

| Escenario | Resultado |
|---|---|
| `ipc` | Completó sin error de proceso; resultados en `ipc\result.json`. |
| `restore-valid` | `ok:true`, marcador `1 → 0`, `relaunch=1`, `exit=1`, auditoría de éxito `1`, 38 tablas. |
| `restore-foreign` | `ok:false` por manifiesto, `relaunch=0`, `exit=0`, `marcadorAjeno=0`, 38 tablas. |
| `restore-corrupt` | `ok:false` por huella, `relaunch=0`, `exit=0`, `sedes=3`, tablas intactas. |

Los cuatro escenarios terminaron con código de salida 0. El arnés usó una BD y
una carpeta de respaldos nuevas dentro de `%TEMP%`; no tocó `data/`.

### 5.4 Verificación estática

| Comprobación | Resultado | Detalle |
|---|---|---|
| `corepack pnpm run lint` | **APROBADO** | 0 errores, 0 warnings. |
| `corepack pnpm audit --prod` | **APROBADO** | `No known vulnerabilities found`. |
| `git diff --check` | **APROBADO** | Exit 0; solo avisos de conversión LF→CRLF. |
| `data/farmacia.db` | **APROBADO** | SHA-256 `5A9093839ED8C6F19486D7111990D126E6A90EA37CAB20223520753F351CEF41`; `mtime` 13/11/2026 17:25; sin cambios. |
| ABI de `better-sqlite3` | **APROBADO** | Todas las pruebas SQLite corrieron bajo Electron 32; no se ejecutó `rebuild:node`. |

---

## 6. Cambio de política: respaldos legacy

Antes de esta corrección, cualquier archivo con el patrón de nombre podía
intentarse restaurar. Ahora un respaldo solo es restaurable si tiene un manifiesto
HMAC válido creado por esta instalación.

Consecuencias deliberadas:

1. Los respaldos existentes en `data/backups` **no tienen manifiesto** y
   quedarán como `No restaurable` para SUPERADMIN (un ADMIN ni siquiera los ve,
   porque no puede acreditarse su sede). No se sellan automáticamente porque no
   se puede demostrar su autenticidad ni su sede de origen.
2. Los respaldos nuevos creados después de esta corrección sí son restaurables.
3. Un respaldo copiado a otra máquina o a otro perfil de Windows no se puede
   restaurar sin la clave de firma correspondiente. La clave debe custodiarse
   por separado de los respaldos (escrow) si se quiere recuperación ante pérdida
   del perfil o del equipo.
4. Un administrador que necesite recuperar un respaldo legacy debe hacerlo por un
   procedimiento manual controlado, fuera de la restauración de la app, con
   respaldo previo de la base activa y validación del esquema.

Este cambio no elimina la copia previa: la restauración autenticada sigue
conservando la base anterior como `.promoted-old.db`.

---

## 7. Riesgos residuales

1. **Electron 32 fuera de soporte (H-12 de 4.1).** No se actualizó por restricción
   de alcance. El runtime se empaqueta y los avisos de seguridad de Electron
   siguen aplicando. Planificar actualización a una versión soportada con pruebas
   de regresión.
2. **Contraseñas iniciales hardcodeadas (H-11 de 4.1).** `wilmer`/`Wilmer465*` y
   `superadmin`/`Superadmin123*` siguen en el seed. En una instalación real son
   una puerta de entrada si no se cambian. Forzar cambio en el primer arranque.
3. **Archivos temporales con datos personales (H-13 de 4.1).** La apertura de
   documentos crea `farmacia-doc-*` en `%TEMP%` y no se observó limpieza. Añadir
   limpieza al cerrar o una tarea periódica.
4. **Validación de firma por magic bytes.** La política acepta un archivo cuya
   cabecera coincide con PDF/PNG/JPEG/GIF/WebP, pero no garantiza que el archivo
   esté completo ni que el visor lo renderice. El riesgo es de disponibilidad del
   visor, no de ejecución; conviene validar estructura o usar un visor integrado.
5. **API HTTP sin TLS (H-15 de 4.1).** Si se expone en LAN con
   `API_HOST=0.0.0.0`, los tokens viajan en claro. Mantener `127.0.0.1` o usar
   TLS/túnel autenticado.
6. **Desajuste MIME en receptores (H-14 de 4.1).** No se revalidó en 4.2. Sigue
   pendiente unificar el contrato de tipos y el límite de tamaño entre órdenes y
   receptores.
7. **Restauración destructiva.** Incluso con `V-4.2-01` corregido, restaurar
   reemplaza la base completa y reinicia la app. Mantener la validación de rol,
   la copia previa y un procedimiento de recuperación documentado.
8. **`puentes:verificarPrerrequisitos` disponible para USUARIO.** Es el
   comportamiento actual; no se modificó. Revisar si un usuario de solo consulta
   debe poder ejecutar diagnósticos de hardware.
9. **CSP de desarrollo.** La CSP de producción se validó; la variante de
   desarrollo (con `unsafe-inline`/`unsafe-eval` si aplica) no se auditó en esta
   etapa. No afecta al payload de producción, pero conviene revisarla antes de
   habilitar DevTools en una máquina compartida.
10. **Ciclo de vida de la clave de firma.** Si se pierde `backup-signing.key.bin`
    o se cambia de usuario/máquina, los respaldos antiguos no se podrán restaurar
    desde la app. Definir escrow/exportación segura de la clave antes de
    producción.
11. **Compromiso del mismo usuario de Windows.** El HMAC acredita que el archivo
    fue creado por esta instalación y no fue alterado fuera de la app. No protege
    frente a un atacante con ejecución de código como el mismo usuario, que
    también podría acceder a la base y a la clave. Es una limitación inherente al
    modelo de custodia local.

---

## 8. Comprobaciones manuales pendientes

Las siguientes comprobaciones **no** se marcan como aprobadas:

1. **Apertura visual del PDF/PNG en el visor del sistema.** El arnés intercepta
   `shell.openPath` y la app real no se inspeccionó visualmente. Verificar en una
   máquina Windows con visor PDF y de imágenes: el archivo debe abrirse desde
   `%TEMP%\farmacia-doc-*\`, con nombre `documento.pdf`/`documento.png`.
2. **Apertura externa HTTPS real.** `window.open('https://example.com/')`
   devuelve `null` y el handler llama a `shell.openExternal`, pero no se observó
   el navegador del sistema. Verificar manualmente que se abre el navegador para
   HTTPS y que no se abre para `http`, `javascript:`, `data:` ni `file:`.
3. **Restauración positiva de un respaldo de sede por un ADMIN en la app real.**
   Las pruebas automatizadas y el arnés cubren el gate y la restauración de
   SUPERADMIN; falta repetir la restauración positiva de un respaldo `SEDE` con
   una sesión ADMIN en la app real.

Además, antes de despliegue:

4. **Definir custodia/escrow de la clave de firma** para recuperación ante
   pérdida del perfil de Windows o cambio de equipo.
5. **Decidir el tratamiento operativo de los respaldos legacy** existentes en
   `data/backups` (archivo histórico, restauración manual controlada o descarte).

---

## 9. Reproducción

### 9.1 Pruebas específicas

```powershell
$env:ELECTRON_RUN_AS_NODE = "1"
& ".\node_modules\electron\dist\electron.exe" --test `
  ".\tests\security\backup_restore_security.test.js" `
  ".\tests\security\orden_documentos.test.js"
Remove-Item Env:\ELECTRON_RUN_AS_NODE
```

### 9.2 Suite completa

```powershell
$files = (Get-ChildItem ".\tests" -Recurse -Filter *.test.js).FullName
$env:ELECTRON_RUN_AS_NODE = "1"
& ".\node_modules\electron\dist\electron.exe" --test $files
Remove-Item Env:\ELECTRON_RUN_AS_NODE
```

### 9.3 Arnés de integración

```powershell
# Requiere dist/renderer/index.html construido
corepack pnpm run build:react
.\tests\e2e\electron-real\run_harness.ps1
```

Cada corrida crea una carpeta nueva bajo
`%TEMP%\farmacia-etapa42\harness-<timestamp>\`. Los resultados quedan en
`<escenario>\result.json`, con `out.log` y `err.log`.

### 9.4 Verificación estática

```powershell
corepack pnpm run lint
corepack pnpm audit --prod
git diff --check
Get-FileHash .\data\farmacia.db -Algorithm SHA256
```

---

## 10. Conclusión

Los tres hallazgos de la Etapa 4.2 quedaron corregidos:

- **`V-4.2-01`:** la restauración ya no acepta un archivo solo por su nombre.
  Exige un manifiesto autenticado, huella, esquema, migraciones y tablas
  compatibles; valida antes de promover; audita antes de promover; conserva la
  base anterior y hace rollback si algo falla después.
- **`V-4.2-02`:** el handler espera la promesa real y solo reinicia tras una
  restauración exitosa.
- **`V-4.2-03`:** los rechazos de adjuntos llegan con el mensaje funcional de la
  política, sin filtrar detalles internos.

La suite completa pasa 323/324; el único fallo es el preexistente de
`release_payload`. ESLint, `pnpm audit --prod` y `git diff --check` están limpios,
y `data/farmacia.db` conserva su hash y `mtime`.

**No se declara la Etapa 4.2 como aprobada/cerrada** hasta completar las tres
verificaciones manuales de la sección 8 y resolver o aceptar formalmente los
hallazgos de cierre `AC-4.2-01` a `AC-4.2-12` (ver sección 11). Los tres
hallazgos originales siguen corregidos; no hay regresiones de `V-4.2-01`,
`V-4.2-02` ni `V-4.2-03`.

Todo el trabajo quedó sin commit en `fix/auditoria-pr3`; no se modificó `main`,
no se actualizó Electron, no se tocaron migraciones ni el esquema, y
`data/farmacia.db` no fue reemplazada.

---

## 11. Actualización — auditoría de cierre (2026-11-15)

La revisión de cierre se documenta en detalle en
[`docs/auditoria-cierre-4.2.md`](auditoria-cierre-4.2.md). Esta sección resume
los resultados formales y **no cambia el estado de aprobación**: la Etapa 4.2
sigue **no cerrada** hasta resolver o aceptar los hallazgos y ejecutar las
verificaciones manuales.

### 11.1 Estado de los hallazgos originales

| ID | Estado en el cierre | Evidencia |
|---|---|---|
| `V-4.2-01` | **Corregido para el vector original** (SQLite ajena solo por nombre). Persisten salvedades de custodia de clave, replay y separación por sede, registradas como hallazgos nuevos. | 12/12 pruebas de `backup_restore_security`; arnés `restore-valid`/`restore-foreign`/`restore-corrupt`. |
| `V-4.2-02` | **Corregido.** El handler espera la promesa y solo reinicia si `resultado.ok === true`. | Arnés real: `relaunch=1`/`exit=1` en éxito y `0`/`0` en rechazo. |
| `V-4.2-03` | **Corregido.** Los rechazos de adjuntos llegan con el mensaje de política. | 9/9 pruebas de `orden_documentos`. |

### 11.2 Hallazgos nuevos de la auditoría de cierre

| ID | Severidad | Estado | Resumen |
|---|---|---|---|
| `AC-4.2-01` | Alta | Abierto | `backups:crear` omite la comprobación de rol con `{ esAutomatico: true }`; un USUARIO crea un respaldo global firmado y no auditado. |
| `AC-4.2-02` | Alta | Abierto | Un respaldo `SEDE` contiene la base completa; su restauración por un ADMIN revierte datos de todas las sedes. |
| `AC-4.2-03` | Alta | Abierto | La clave de firma ausente se regenera en silencio; los respaldos anteriores quedan no restaurables y no hay escrow ni recuperación. |
| `AC-4.2-04` | Media | Abierto | Sin retención efectiva; `maximo_respaldos_por_sede` no se usa y `docs/backups.md` documenta una purga que ya no existe. |
| `AC-4.2-05` | Media | Abierto | La restauración no comprueba espacio libre antes de copiar staging/rollback. |
| `AC-4.2-06` | Media | Abierto | Nombres con resolución de segundos: dos respaldos en el mismo segundo colisionan y el segundo sobrescribe al primero. |
| `AC-4.2-07` | Baja | Abierto | `listar` marca `restaurable:true` sin recalcular el SHA-256 del `.db`; la restauración sí lo revalida. |
| `AC-4.2-08` | Media (datos) | Riesgo abierto | Respaldos SQLite en texto plano; el HMAC no aporta confidencialidad y `data/backups` está en OneDrive en este entorno. |
| `AC-4.2-09` | Baja | Abierto | El fallback fuera de Electron escribe una clave cruda en `data/backup-signing.key`, sin `safeStorage`. |
| `AC-4.2-10` | Baja | Abierto | Reemplazo del manifiesto no atómico (`rmSync` + `renameSync`). |
| `AC-4.2-11` | Baja (docs) | Abierto | `docs/backups.md` describe retención y `purgarRespaldosAntiguos` inexistentes. |
| `AC-4.2-12` | Baja/Media (gobierno) | Abierto | Sin doble control real para restaurar ni para exportar/rotar la clave. |

Los hallazgos `AC-4.2-04` a `AC-4.2-12` incluyen riesgos operativos, de
protección de datos, documentación y gobierno; no todos son vulnerabilidades
explotables. Se listan separados para no diluir los tres bloqueantes.

### 11.3 Evidencia de las demostraciones aisladas

Ejecutadas con el handler IPC real y SQLite en `%TEMP%`, con
`ELECTRON_RUN_AS_NODE=1` sobre Electron 32.3.3. Los scripts y salidas están en
`%TEMP%\opencode\audit-4.2\`.

| Hallazgo | Demostración | Resultado |
|---|---|---|
| `AC-4.2-01` | `demo_esautomatico.js` | USUARIO con `{}` rechazado; con `{esAutomatico:true}` crea `farmacia_backup_auto_global_*.db` firmado, `restaurable:true` y **0** filas de auditoría. |
| `AC-4.2-02` | `demo_sede_cruzada.js` | Un respaldo `SEDE` de la sede 1 contiene las 3 sedes; al restaurarlo desaparecen la sede 4 y el marcador de la sede 2. |
| `AC-4.2-03` | `demo_perdida_clave.js` | Al borrar la clave, el siguiente respaldo usa un `claveId` nuevo; el anterior pasa a `restaurable:false` y su restauración se rechaza. |
| `AC-4.2-06` | Observado en la primera corrida de `demo_perdida_clave.js` | Dos respaldos en el mismo segundo usan el mismo nombre; el segundo sobrescribe al primero. |

### 11.4 Pruebas, lint y auditoría

| Comprobación | Resultado |
|---|---|
| Pruebas específicas (`backup_restore_security`, `orden_documentos`, `ipc_handlers`, `startupRecovery`) | **55/55**, 6 suites, 0 fallos. |
| Suite completa | **324 tests, 323 pass, 1 fail**; el fallo es `tests/unit/release_payload.test.js` (preexistente, ajeno a 4.2). |
| `corepack pnpm run lint` | 0 errores (exit 0). |
| `corepack pnpm audit --prod` | Sin vulnerabilidades conocidas. |
| `git diff --check` | Exit 0; solo avisos LF→CRLF. |

### 11.5 `release_payload.test.js`

El fallo es preexistente: la prueba exige `dist/**/*` en `package.json#build.files`
pero el archivo tiene `dist/renderer/**/*`. Prueba y patrón se introdujeron en el
mismo commit `89420f3`, y el desajuste también está en `main`. No es una
regresión de 4.2, no se modificó la prueba ni `package.json`, y no se debe
cambiar el patrón a ciegas sin verificar el payload real de `electron-builder`.

### 11.6 Custodia y legacy

- Se documentó un diseño de custodia (keyring versionado + kit de escrow
  cifrado, rotación y revocación) en
  [`docs/auditoria-cierre-4.2.md`](auditoria-cierre-4.2.md), sección 4. **No se
  implementó.**
- Se documentó una política de respaldos legacy (inventario, validación
  estructural sobre copia, procedencia declarada, importación supervisada y
  nuevo respaldo autenticado) en la sección 5 del mismo documento. **No se
  implementó ni se generó ningún manifiesto HMAC para los 25 respaldos
  existentes**, que siguen sin ser restaurables.
- El perfil inspeccionado no contiene `backup-signing.key.bin`; no se pudo
  probar el ciclo real de `safeStorage`/DPAPI con una clave existente.

### 11.7 Verificaciones manuales

Las tres comprobaciones de la sección 8 siguen **NO EJECUTADAS** y no se marcan
como aprobadas. Los procedimientos reproducibles, con base aislada, están en
[`docs/auditoria-cierre-4.2.md`](auditoria-cierre-4.2.md), sección 7.

### 11.8 Conclusión de la actualización

Los tres hallazgos originales siguen corregidos y no hay regresiones de
`V-4.2-01`, `V-4.2-02` ni `V-4.2-03`. La Etapa 4.2 **no se declara cerrada ni
aprobada**: quedan tres hallazgos altos abiertos (`AC-4.2-01`, `AC-4.2-02`,
`AC-4.2-03`), riesgos operativos y de datos sin decisión formal, y las
verificaciones manuales A/B/C pendientes. El trabajo de esta auditoría es
documental y de pruebas aisladas; no se modificó código de producción, `main`,
migraciones ni `data/farmacia.db`.
