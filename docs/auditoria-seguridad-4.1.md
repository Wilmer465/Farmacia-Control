# Auditoría de seguridad — Etapa 4.1

**Rama:** `fix/auditoria-pr3`
**Fecha:** 2026-11-13
**Alcance:** Electron, preload, IPC, renderer React, servidor HTTP local, respaldos,
catálogo CUM, adjuntos de órdenes/receptores y dependencias.
**Restricciones respetadas:** sin acceso a producción, sin cambios en `main`, sin
commits/PR, sin modificar el motor de sincronización de Etapa 2, sin implementar
el actualizador de Etapa 5 y conservando los permisos actuales de SUPERADMIN,
ADMIN, INVENTARIO y USUARIO.

---

## 1. Resumen ejecutivo

Se identificaron y corrigieron las superficies que permitían a un renderer
comprometido, a una navegación no autorizada o a parámetros manipulados por IPC
llegar a operaciones privilegiadas. Los cambios son defensivos: no alteran las
reglas de negocio ni los roles existentes.

Resultados principales:

- Todos los canales IPC pasan por un envoltorio que valida el origen exacto del
  remitente, rechaza iframes y sanea errores antes de devolverlos al renderer.
- El renderer ya no abre documentos con `window.open(dataUrl)`: el proceso main
  valida la firma binaria, escribe un archivo temporal con nombre generado y lo
  entrega al visor del sistema. La ruta nunca vuelve al renderer.
- Los adjuntos de catálogo CUM y de órdenes se validan por contenido real
  (PDF/PNG/JPEG/GIF/WebP), tamaño y nombre, no por la extensión declarada.
- `sedes:listar` exige sesión y limita el alcance por rol; `sedes:crear` quedó
  registrado y protegido para SUPERADMIN; `puentes:verificarPrerrequisitos`
  exige sesión.
- Navegación, ventanas nuevas, permisos del sistema, webviews y CSP quedaron
  cerrados por defecto.
- `pnpm audit --prod` queda en **0 vulnerabilidades**.
- Se añadieron **67 pruebas de seguridad** y se actualizó la prueba de preload
  existente. La suite completa ejecutó **303 pruebas: 302 pasan y 1 falla por un
  desajuste preexistente ajeno a esta etapa** (`release_payload.test.js`).

---

## 2. Hallazgos y estado

| ID | Hallazgo | Severidad | Estado |
|---|---|---|---|
| H-01 | Los handlers IPC no validaban el origen ni el frame del remitente. Cualquier `webContents` podía invocar canales privilegiados. | Alta | Corregido |
| H-02 | `sedes:listar` no exigía sesión y devolvía todas las sedes a cualquier rol. | Media | Corregido |
| H-03 | El preload exponía `sedes.crear`, pero no existía el handler IPC correspondiente. | Media | Corregido |
| H-04 | `puentes:verificarPrerrequisitos` no exigía sesión y revelaba rutas/estado del equipo. | Media | Corregido |
| H-05 | Documentos del catálogo CUM: base64 sin validar, tipo declarado por el renderer y apertura mediante `window.open(dataUrl)`. | Alta | Corregido |
| H-06 | Adjuntos de órdenes/receptores: data URLs sin validar firma, tamaño ni MIME real. | Alta | Corregido |
| H-07 | La restauración de respaldos aceptaba cualquier archivo `.db` presente en la carpeta de respaldos, no solo los generados por la app. | Media | Corregido |
| H-08 | Errores internos de SQLite/Node podían cruzar IPC y revelar rutas, tablas y detalles del entorno. | Media | Corregido |
| H-09 | Navegación, ventanas nuevas, permisos, webviews y CSP no tenían una política única y cerrada por defecto. | Media/Alta | Corregido |
| H-10 | Dependencias de producción con vulnerabilidades conocidas (`@xmldom/xmldom`, `node-forge`, `react-router-dom`). | Alta | Corregido |
| H-11 | Contraseñas iniciales hardcodeadas en el seed (`Wilmer465*`, `Superadmin123*`). | Alta | Residual aceptado |
| H-12 | Electron 32 está fuera de soporte y acumula avisos de seguridad del runtime. | Alta | Residual aceptado |
| H-13 | Los documentos abiertos quedan en `%TEMP%` y no se eliminan al cerrar la app. | Baja/Media | Residual |
| H-14 | `receptorRepository` espera MIME (`application/pdf`, `image/png`, `image/jpeg`) mientras las órdenes envían `PDF`/`IMAGEN`; el guardado del receptor falla de forma no bloqueante. | Baja | Residual preexistente |
| H-15 | La API HTTP usa Bearer sin TLS; si se configura `API_HOST=0.0.0.0`, el login queda expuesto en la LAN. | Media | Residual operacional |
| H-16 | El toolchain de build (`electron-builder`, `vite`, `eslint`) acumula avisos del audit completo. | Media | Residual de desarrollo |

---

## 3. Correcciones aplicadas

### 3.1 Validación del remitente IPC (H-01)

Nuevo módulo `backend/security/ipcSecurity.js`:

- Exige `event.sender.getURL()` y que `event.senderFrame === event.sender.mainFrame`;
  un iframe, un frame ausente o un `getURL()` que lance se rechazan por diseño.
- En desarrollo solo acepta `http://localhost:5173`, `http://127.0.0.1:5173` y
  `http://[::1]:5173`.
- En producción solo acepta el `dist/renderer/index.html` empaquetado exacto.
- Todos los canales se registran con `seguridad.registrar(...)`; no quedan
  handlers `ipcMain.handle` sueltos.
- Los errores se sanean antes de volver al renderer y se registran solo en el
  proceso main.

Archivos: `backend/security/ipcSecurity.js`, `shared/appOriginPolicy.js`,
`backend/ipcHandlers.js`.

### 3.2 Alcance de sedes y handler faltante (H-02, H-03)

- `sedeService.listarParaUsuario(usuarioSesion)` devuelve todas las sedes solo
  para SUPERADMIN y únicamente la sede propia para los demás roles.
- `sedes:listar` exige sesión y usa ese método.
- Se registró `sedes:crear` con validación de sesión y la restricción existente
  de SUPERADMIN.
- Los llamadores del renderer (`Auditoria`, `Reportes`, `Respaldos`, `Usuarios`)
  pasan la sesión.

Archivos: `backend/services/sedeService.js`, `backend/ipcHandlers.js`,
`src/pages/Auditoria.jsx`, `src/pages/Reportes.jsx`, `src/pages/Respaldos.jsx`,
`src/pages/Usuarios.jsx`.

### 3.3 Prerrequisitos de puentes (H-04)

- El controlador expone `verificarPrerrequisitos()` sin argumentos y conserva
  `crearHandler()` para las pruebas existentes.
- El canal exige sesión resuelta en el proceso main; el preload reenvía solo el
  token de sesión, nunca rutas.

Archivos: `backend/controllers/bridgePrerequisitesController.js`,
`backend/ipcHandlers.js`, `electron/preload.js`, `src/services/inventarioApi.js`.

### 3.4 Documentos CUM y adjuntos (H-05, H-06)

Nuevo módulo `shared/documentPolicy.js`:

- Decodifica base64/data URL de forma estricta y verifica que el contenido
  re-codificado coincida.
- Detecta el tipo real por firma binaria: PDF, PNG, JPEG, GIF y WebP. Rechaza
  SVG, ejecutables y bytes arbitrarios.
- Límite de 10 MB, nombre máximo de 255 caracteres y rechazo de separadores de
  ruta/caracteres de control.
- Valida que el tipo declarado (`PDF`/`IMAGEN`) y el MIME de la data URL
  coincidan con la firma real.

Nuevo módulo `electron/documentOpener.js`:

- Valida el documento otra vez en el proceso main.
- Escribe en un directorio temporal único con nombre `documento.<ext>` y modo
  `0600`; el nombre original nunca se usa como ruta.
- Abre con `shell.openPath` y devuelve solo `{ abierto, nombre, tipo }`. La ruta
  no cruza IPC.
- `CatalogoCUM.jsx` usa `catalogoCum:mostrarDocumento` en lugar de
  `window.open(dataUrl)`.

`ordenService` aplica la misma política en creación y actualización de
documentación de órdenes. `catalogoCumService` valida IDs positivos, limita la
búsqueda a 1..100 resultados y 200 caracteres, y normaliza el documento antes de
persistirlo.

Archivos: `shared/documentPolicy.js`, `electron/documentOpener.js`,
`backend/services/catalogoCumService.js`, `backend/services/ordenService.js`,
`src/pages/CatalogoCUM.jsx`, `src/services/inventarioApi.js`,
`src/shimWindowApi.js`, `electron/preload.js`, `backend/ipcHandlers.js`.

### 3.5 Restauración de respaldos (H-07)

`backupService` exige el patrón completo generado por la app:

```
farmacia_backup[_auto]_(global|sede_<nombre>)_AAAAMMDD_HHMMSS.db
```

Se mantiene la comprobación previa contra separadores y `..`. Esto impide
restaurar una base ajena copiada manualmente en la carpeta de respaldos.

Archivo: `backend/services/backupService.js`.

### 3.6 Saneamiento de errores (H-08)

Nuevo módulo `shared/errorSanitizer.js`:

- Sustituye por un mensaje genérico los errores que contienen rutas Windows/UNC/
  POSIX, `node_modules`, `better-sqlite3`, `NODE_MODULE_VERSION`,
  `ERR_DLOPEN_FAILED`, `SqliteError`, `SQLITE_*`, `no such table/column`,
  `constraint failed`, `ENOENT/EACCES/EPERM`, SQL y marcos de pila.
- Conserva los mensajes funcionales en español.
- Limpia caracteres de control, colapsa espacios y limita a 300 caracteres.
- `sanearRespuesta` también sanea el contrato `{ ok:false, error }` devuelto por
  los controladores.

Archivos: `shared/errorSanitizer.js`, `backend/security/ipcSecurity.js`,
`backend/ipcHandlers.js`.

### 3.7 Navegación, ventanas y CSP (H-09)

`electron/main.js` ahora:

- Deniega todos los permisos del sistema por defecto
  (`setPermissionRequestHandler`/`setPermissionCheckHandler`).
- Bloquea `will-navigate`, `will-redirect` y `will-attach-webview`.
- Deniega toda ventana nueva; solo abre externamente URLs HTTPS con host.
- Endurece `webPreferences`: `contextIsolation`, `sandbox`, `webSecurity`,
  `nodeIntegration: false`, `webviewTag: false`,
  `nodeIntegrationInWorker/SubFrames: false`, `navigateOnDragDrop: false` y
  `devTools` solo en desarrollo.
- Aplica una CSP única: producción sin `unsafe-inline`/`unsafe-eval`,
  `object-src 'none'`, `frame-src 'none'`, `frame-ancestors 'none'`,
  `base-uri 'self'` y `connect-src 'self'`.

Archivos: `electron/main.js`, `shared/contentSecurityPolicy.js`,
`electron/navigationPolicy.js`, `shared/appOriginPolicy.js`.

### 3.8 Dependencias (H-10)

- `@xmldom/xmldom` → `^0.9.12`.
- `node-forge` → `^1.4.3`.
- `react-router-dom` eliminado (no se usaba) y retirado de `vite.config.js`.
- Overrides de `body-parser@^1.20.9` y `qs@^6.16.1` en `pnpm-workspace.yaml`
  (pnpm 11 ignora `package.json#pnpm.overrides`).
- `corepack pnpm audit --prod --json`: **0 critical, 0 high, 0 moderate,
  0 low**.

Archivos: `package.json`, `pnpm-lock.yaml`, `pnpm-workspace.yaml`,
`vite.config.js`.

---

## 4. Pruebas de seguridad añadidas

| Archivo | Cobertura |
|---|---|
| `tests/security/app_origin_policy.test.js` | Orígenes dev/prod, navegación, apertura externa HTTPS, CSP. |
| `tests/security/error_sanitizer.test.js` | Rutas, SQL, módulos nativos, marcos de pila, límites y contrato `{ok:false}`. |
| `tests/security/document_policy.test.js` | Firmas PDF/PNG/JPEG/GIF/WebP, SVG, tamaño, base64, nombres y data URLs. |
| `tests/security/ipc_sender_policy.test.js` | Remitente permitido/denegado, iframe, frame ausente, errores saneados y registro. |
| `tests/security/catalogo_documentos.test.js` | Persistencia válida, rechazo de adjuntos manipulados, IDs, roles, límites y apertura temporal. |
| `tests/security/ipc_handlers_security.test.js` | Registro de canales, origen no autorizado, sin sesión, token falso, alcance de sedes, `sedes:crear`, CUM, `mostrarDocumento`, puentes y nombre de PDF. |
| `tests/security/preload_exposure.test.js` | API congelada, ausencia de `ipcRenderer`/Node, canales explícitos y reenvío mínimo de argumentos. |
| `tests/security/renderer_credentials.test.js` | Ausencia de `service_role`/secretos DIAN/`process.env` en `src`, preload, móvil, `.env` y empaquetado. |
| `tests/unit/bridge_prerequisites.test.js` | Actualizado: el preload reenvía solo la sesión al canal de puentes. |

Comandos ejecutados:

```powershell
$env:ELECTRON_RUN_AS_NODE = "1"
& ".\node_modules\electron\dist\electron.exe" --test --test-reporter=spec `
  ".\tests\security\app_origin_policy.test.js" `
  ".\tests\security\error_sanitizer.test.js" `
  ".\tests\security\document_policy.test.js" `
  ".\tests\security\ipc_sender_policy.test.js" `
  ".\tests\security\catalogo_documentos.test.js" `
  ".\tests\security\ipc_handlers_security.test.js" `
  ".\tests\security\preload_exposure.test.js" `
  ".\tests\security\renderer_credentials.test.js"
Remove-Item Env:ELECTRON_RUN_AS_NODE
```

Resultado: **67 pruebas de seguridad, 67 pasan**.

Suite completa:

```powershell
$files = (Get-ChildItem ".\tests" -Recurse -Filter *.test.js).FullName
$env:ELECTRON_RUN_AS_NODE = "1"
& ".\node_modules\electron\dist\electron.exe" --test --test-reporter=spec $files
Remove-Item Env:ELECTRON_RUN_AS_NODE
```

Resultado: **303 pruebas, 302 pasan, 1 falla**.

La única falla es `tests/unit/release_payload.test.js`, que espera
`dist/**/*` en `package.json#build.files`; el `package.json` de `HEAD` ya tiene
`dist/renderer/**/*`. Es un desajuste preexistente y ajeno a la Etapa 4.1, por lo
que no se modificó el empaquetado ni la prueba.

Lint:

```powershell
corepack pnpm run lint
```

Resultado: **0 errores**.

Auditoría de producción:

```powershell
corepack pnpm audit --prod --json
```

Resultado: **0 vulnerabilidades**.

---

## 5. Archivos modificados y añadidos

**Añadidos**

- `backend/security/ipcSecurity.js`
- `electron/documentOpener.js`
- `electron/navigationPolicy.js`
- `shared/appOriginPolicy.js`
- `shared/contentSecurityPolicy.js`
- `shared/documentPolicy.js`
- `shared/errorSanitizer.js`
- `tests/security/app_origin_policy.test.js`
- `tests/security/catalogo_documentos.test.js`
- `tests/security/document_policy.test.js`
- `tests/security/error_sanitizer.test.js`
- `tests/security/ipc_handlers_security.test.js`
- `tests/security/ipc_sender_policy.test.js`
- `tests/security/preload_exposure.test.js`
- `tests/security/renderer_credentials.test.js`

**Modificados**

- `backend/controllers/bridgePrerequisitesController.js`
- `backend/ipcHandlers.js`
- `backend/services/backupService.js`
- `backend/services/catalogoCumService.js`
- `backend/services/ordenService.js`
- `backend/services/sedeService.js`
- `electron/main.js`
- `electron/preload.js`
- `package.json`
- `pnpm-lock.yaml`
- `pnpm-workspace.yaml`
- `src/components/DocumentacionReceptor.jsx`
- `src/components/OrdenForm.jsx`
- `src/pages/Auditoria.jsx`
- `src/pages/CatalogoCUM.jsx`
- `src/pages/Ordenes.jsx`
- `src/pages/Reportes.jsx`
- `src/pages/Respaldos.jsx`
- `src/pages/Usuarios.jsx`
- `src/services/inventarioApi.js`
- `src/shimWindowApi.js`
- `tests/unit/bridge_prerequisites.test.js`
- `vite.config.js`

---

## 6. Riesgos residuales y recomendaciones

1. **Contraseñas iniciales hardcodeadas (H-11).** El seed crea
   `wilmer`/`Wilmer465*` y `superadmin`/`Superadmin123*`. En una instalación
   real, cualquier persona que conozca el repositorio puede iniciar sesión si la
   contraseña no se cambió. Se recomienda generar una contraseña aleatoria en el
   primer arranque, mostrarla una sola vez y forzar el cambio; no se hizo en esta
   etapa para no romper el onboarding ni las pruebas existentes.
2. **Electron 32 fuera de soporte (H-12).** `pnpm audit --prod` no lo reporta
   porque es `devDependency`, pero su runtime se empaqueta. Los avisos del audit
   completo incluyen bypass de sandbox, aislamiento de contexto y UAF. Se
   recomienda planificar la actualización a una versión soportada (41/42+) con
   pruebas de regresión; no se actualizó en esta etapa por decisión de alcance.
3. **Archivos temporales con datos personales (H-13).** `abrirDocumentoTemporal`
   deja el documento en `%TEMP%` para que el visor del sistema lo abra. Se
   recomienda limpiar los directorios `farmacia-doc-*` al cerrar la app o con una
   tarea periódica.
4. **Desajuste MIME en receptores (H-14).** `receptorRepository` acepta
   `application/pdf`, `image/png` e `image/jpeg`, mientras las órdenes envían
   `PDF`/`IMAGEN`. El guardado del receptor falla de forma no bloqueante y la
   orden sí se crea. Es un bug preexistente; conviene unificar el contrato y
   alinear el límite de 2 MB del repositorio con el de 10 MB de la política.
5. **API HTTP sin TLS (H-15).** Por defecto escucha en `127.0.0.1`. Si se usa
   `API_HOST=0.0.0.0` para un móvil físico, los tokens Bearer viajan en claro por
   la LAN. Se recomienda TLS o un túnel autenticado antes de exponerla.
6. **Toolchain de desarrollo (H-16).** El audit completo reporta avisos en
   `electron-builder`, `vite`, `eslint` y dependencias transitivas. No forman
   parte del payload de producción, pero conviene actualizar el toolchain en una
   tarea separada.
7. **Restauración de respaldos.** El patrón estricto reduce la superficie, pero
   restaurar sigue reemplazando la base completa y reiniciando la app. Mantener
   la validación de rol y la copia de seguridad previa como defensa en
   profundidad.

---

## 7. Conclusión

Las vulnerabilidades reproducibles dentro del alcance quedaron corregidas y
cubiertas por pruebas automatizadas. No se detectaron credenciales privilegiadas
en el renderer ni en el bundle móvil, y la auditoría de dependencias de
producción quedó limpia. Los riesgos residuales principales son decisiones de
producto/operación (contraseñas iniciales, versión de Electron y exposición
HTTP), no regresiones introducidas por esta etapa.
