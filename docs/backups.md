# Módulo de Respaldos

Documentación de la implementación actual y del refactor aplicado.

## Qué hace

El módulo crea, lista y restaura copias de la base SQLite local (`data/farmacia.db`
en desarrollo, `userData/farmacia.db` empaquetada). Corre en el proceso main de
Electron porque necesita la conexión `better-sqlite3` compartida con los handlers
IPC y acceso al sistema de archivos.

## Arquitectura

```
Renderer  src/pages/Respaldos.jsx
   │  window.api.backups.*            (preload/contextBridge)
   ▼
Main      electron/preload.js → backend/ipcHandlers.js:231-249
   │  backupController.*              (valida sesión y formatea respuesta)
   ▼
Servicio  backend/services/backupService.js
   │  backupService.listar/crear/restaurar/ultimoRespaldo
   ▼
SQLite    data/backups/*.db
```

`conValidacionSesion` (`ipcHandlers.js:30`) resuelve el usuario **desde el
servidor** antes de invocar el controlador. El rol y la sede nunca se toman del
objeto que manda el renderer.

## Archivos

| Archivo | Responsabilidad |
|---|---|
| `backend/services/backupService.js` | Lógica de respaldo, validación de integridad, planificador automático |
| `backend/controllers/backupController.js` | Envoltura: `try/catch`, formato `{ ok, data \| error }` |
| `backend/ipcHandlers.js` | Registro de los canales `backups:*` |
| `electron/preload.js` | Puente `contextBridge` |
| `src/pages/Respaldos.jsx` | UI de la vista |

## Restricción de permisos

`verificarAccesoRespaldos` (`backupService.js:12`) limita a `SUPERADMIN` y
`ADMIN`. Los respaldos automáticos se saltan esa comprobación porque corren sin
usuario de sesión, y por eso tampoco se auditan: el registro de auditoría exige
`usuario_id` y una fila automática no lo tiene (`CREATEAR_RESPALDO`).

`restaurar` requiere doble confirmación en la UI (`window.confirm` y luego
`window.prompt` con la palabra `RESTAURAR`), valida el nombre contra path
traversal y valida integridad **antes** de tocar la base viva.

## Copia de la base: por qué `db.backup()`

La versión anterior usaba `fs.copyFileSync`. Se cambió a `db.backup(destino)`,
la API online de SQLite, que devuelve una Promise y produce un archivo consistente
aunque haya escrituras concurrentes.

La razón **no** es el modo WAL: `crear()` ya ejecutaba `wal_checkpoint(FULL)`
antes de copiar. La razón real es que `copyFileSync` deja una ventana entre el
checkpoint y la copia durante la cual una escritura concurrente puede dejar el
archivo inconsistente. `db.backup()` no tiene esa ventana.

Verificado empíricamente sobre un respaldo real: `integrity_check` devuelve `ok`
y los conteos por tabla coinciden con la base viva abriendo **solo** el `.db`.

## Companion files

`db.backup()` deja los archivos `-wal` y `-shm` junto al destino aunque el `.db`
ya esté completo. `limpiarCompanionFiles` los elimina, con una condición: el
`-wal` solo se borra si está vacío. Si alguna vez quedara con contenido, borrarlo
perdería datos, porque `restaurar` copia únicamente el `.db`.

## Planificador automático

`iniciarPlanificadorAutoBackup` revisa cada 60 s y ejecuta el respaldo según la
frecuencia configurada en `backup_config.json`.

Dos detalles que importan:

- `verificarYEjecutarAutoBackup` es **async** y el `setInterval` no espera su
  promesa. El error se captura dentro de la propia función y el `setInterval`
  añade un `.catch()` de respaldo, para que un rechazo sin capturar no tumbe el
  proceso main.
- El timestamp `ultimo_backup_auto` se escribe **siempre**, incluso si el respaldo
  falla (bloque `finally`). Si no avanzara, `debeEjecutar` seguiría siendo `true`
  en cada chequeo y el planificador reintentaría en bucle cuando la causa fuera
  persistente (disco lleno, permisos).

## Retención y espacio en disco

Un respaldo completo ronda los 81 MB (y eran ~37 MB tras la migración 026, con
`catalogo_cum` ya optimizado). A una frecuencia horaria son ~2 GB diarios por
sede: sin retención el disco se llena en semanas y el fallo llega como `ENOSPC`,
que no dice nada útil.

`purgarRespaldosAntiguos` se ejecuta **después** de crear y validar cada respaldo.
Sus reglas:

- **Solo toca `farmacia_backup_auto*`.** Un respaldo manual es una decisión
  explícita de una persona; borrarlo porque lo decidió el planificador sería
  inaceptable.
- **Cuenta por alcance de sede**, no globalmente: los respaldos de una sede no
  pueden empujar a los de otra. El alcance viaja en el nombre (`_sede_12` o
  `_global`), que es la única información de sede que tiene un archivo suelto.
- **Ordena por mtime, no por nombre.** El timestamp del nombre tiene resolución
  de segundos, así que dos respaldos del mismo segundo se ordenarían mal.
  Y purgea del más antiguo: ordenar al revés y hacer `slice(0, n)` parece
  equivalente, pero borra justo los más recientes y deja los viejos.
- **Nunca borra el recién creado.** Se llama con `protegerNombre`, que queda
  excluido de los candidatos y cuenta para el límite.
- Si la validación de integridad falla, la purga **se salta**: es preferible un
  disco lleno diagnosticable a perder historia con un respaldo roto.
- Un límite inválido (`0`, negativo, texto) cae al valor por defecto en vez de
  interpretarse como "sin límite", que es justo el fallo que se quiere evitar.

El límite se configura en `backup_config.json` con
`maximo_respaldos_por_sede` (por defecto 20) y se edita desde la UI en
Respaldos. `espacioLibreBytes` mide el volumen con `fs.statfsSync` y devuelve
`null` si el runtime no lo expone: en ese caso no se bloquea la creación, porque
avisar de "disco lleno" sin haber podido medir sería peor que no avisar.
`consumo` informa del total en disco, sin filtrar por alcance.

## Bugs corregidos

### 1. Promises serializadas como `{}` por IPC

`backupService.listar` y `.ultimoRespaldo` son async, pero el controlador era
síncrono:

```javascript
// ANTES
function listar(usuarioSesion, filtros) {
  return { ok: true, data: backupService.listar(usuarioSesion, filtros) };
}
```

El objeto `{ ok: true, data: <Promise> }` **no es un *thenable***, así que
`ipcMain.handle` no lo resolvía. Electron serializaba la Promise como `{}` por
*structured clone*, y el renderer recibía un objeto vacío donde esperaba un
array. `Respaldos.jsx` reventaba en `.map()`.

Corregido making `listar`, `crear` y `ultimoRespaldo` async con `await`.

### 2. Defecto encadenado al migrar a `db.backup()`

`db.backup()` devuelve Promise, así que `crear` pasó a ser async. Eso tenía dos
consumidores que también había que actualizar, y ambos se habrían roto igual:

- `backupController.crear` habría reproducido **el mismo bug del punto 1**.
- `verificarYEjecutarAutoBackup` llamaba `crear(null, true)` de forma síncrona y
  leía `res.nombre`: `undefined`.

### 3. `AUDIT_ACTIONS.ACTUALIZAR_CONFIG` inexistente

`guardarConfigAutoBackup` auditaba con `AUDIT_ACTIONS.ACTUALIZAR_CONFIG`, que no
existía en `shared/constants.js`. El valor era `undefined` y `auditoria.accion`
es `NOT NULL`, así que **guardar la configuración de respaldos siempre fallaba**.
El error quedaba envuelto en un `{ ok: false }` genérico, así que en la UI se
manifestaba como "Error interno" sin causa visible.

### 4. `colSpan` descuadrado y estado no defensivo

`Respaldos.jsx` tenía `colSpan="5"` en una tabla de 6 columnas, y hacía
`setRespaldos(resList.data)` sin validar. Ahora:

- `colSpan={6}` en la fila de estado vacío, y una fila de carga independiente.
- Guardia `Array.isArray()`: si el backend devolviera algo que no sea un array,
  el estado queda `[]` en vez de propagar un objeto que revienta `.map()`.

### 5. Tests que escribían en la base de desarrollo

`carpetaRespaldos()` y `rutaConfigAutoBackup()` derivan de `resolveDbPath()`,
que ignora la base en memoria de `createTestDb()`. Un test de `restaurar` habría
sobrescrito `data/farmacia.db` real, y `guardarConfigAutoBackup` habría pisado
`data/backup_config.json`. `setDirectorioRespaldos()` redirige ambas rutas; solo
lo usan los tests.

## Tests

`tests/ipc/ipc_handlers.test.js`, suite "FASE 4 (bis)" — 7 casos:

| Test | Qué cubre |
|---|---|
| `listar devuelve un Array real` | Regresión del bug de Promise, incluido `structuredClone` |
| `listar crea un respaldo y lo devuelve` | Ciclo completo creación + listado |
| `el .db es legible, íntegro y autónomo` | `integrity_check`, ausencia de `-wal`/`-shm`, lectura aislada |
| `ultimoRespaldo devuelve objeto o null` | Idem para la segunda función async |
| `listar rechaza sin permisos` | `PermisoError` envuelto, sin excepción |
| `un fallo no se propaga` | Sin rechazo sin capturar desde el `setInterval` |
| `el planificador avanza el timestamp` | Sin doble respaldo en la misma ventana |

## Ejecutar los tests

`better-sqlite3` está compilado para el runtime de Electron
(`NODE_MODULE_VERSION 128`), no para el Node CLI (127). Con Node CLI falla:

```
Error: The module '.../better_sqlite3.node' was compiled against a different
Node.js version using NODE_MODULE_VERSION 128.
```

Hay que invocar el runner con el binario de Electron como Node:

```powershell
$env:ELECTRON_RUN_AS_NODE = "1"
& ".\node_modules\electron\dist\electron.exe" --test ".\tests\ipc\ipc_handlers.test.js"
```

Aplica igual a `npm run migrate`.

## Nota sobre `restaurar`

Tras restaurar, `ipcHandlers.js:259-268` hace `app.relaunch()` y `app.exit(0)`.
No hace falta reabrir la conexión: el proceso se reinicia entero para que no
queden *prepared statements* en caché con los datos viejos.