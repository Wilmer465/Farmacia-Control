# AGENTS.md — Farmacia Control

Convenciones y trampas del entorno para trabajar en este repositorio.

## Entorno: better-sqlite3 tiene dos compilaciones

**El fallo más común al tocar la base de datos.** `better-sqlite3` es un módulo
nativo y solo puede compilarse para un runtime a la vez:

| Runtime | NODE_MODULE_VERSION |
|---|---|
| Electron 32 (la app) | 128 |
| Node CLI 22 | 127 |

El repo está en modo **Electron**: `npm install` dispara
`electron-builder install-app-deps` (`postinstall`), que reconstruye el binario
para Electron. Con esa compilación, cualquier comando que corra bajo Node CLI
falla:

```
Error: The module '...\better_sqlite3.node' was compiled against a different
Node.js version using NODE_MODULE_VERSION 128. This version of Node.js requires
NODE_MODULE_VERSION 127.
```

Afecta a `npm test`, `npm run migrate` y `npm run seed`.

### Ejecutar tests con el runtime de Electron

```powershell
$env:ELECTRON_RUN_AS_NODE = "1"
& ".\node_modules\electron\dist\electron.exe" --test ".\tests\ipc\ipc_handlers.test.js"
Remove-Item "$env:ELECTRON_RUN_AS_NODE"
```

PowerShell no expande `tests/**/*.test.js`, así que para la suite completa hay
que pasar la lista explícita:

```powershell
$files = (Get-ChildItem ".\tests" -Recurse -Filter *.test.js).FullName
$env:ELECTRON_RUN_AS_NODE = "1"
& ".\node_modules\electron\dist\electron.exe" --test $files
```

### Alternar entre compilaciones

```powershell
npm run rebuild:electron   # para la app (estado por defecto del repo)
npm run rebuild:node       # para correr tests/migraciones con Node CLI
```

**Devuelve el repo al estado Electron antes de dar por terminada una tarea.**
Si dejas el binario compilado para Node CLI, la app no arranca.

### Migraciones

```powershell
# Estado Electron (por defecto):
$env:ELECTRON_RUN_AS_NODE = "1"
& ".\node_modules\electron\dist\electron.exe" ".\backend\database\migrate.js"
```

`backend/database/migrate.js` SÍ tiene bloque `require.main` (`migrate.js:51-53`):
invocarlo como script ejecuta `runMigrations()`. Por eso `npm run migrate`, que
lanza Node CLI, falla con `ERR_DLOPEN_FAILED` y no "no hace nada".

Dos comportamientos del runner que conviene conocer:

- Registra por `migration.name`, no por nombre de archivo. Los duplicados del
  numbering (`019_`, `020_`) son un bug conocido y ambos se aplican.
- Por defecto envuelve cada `up(db)` en `db.transaction()`. SQLite rechaza
  `VACUUM` ahí dentro, así que una migración que lo necesite debe declarar
  `atomic: false` (ver `026_optimizar_catalogo_cum.js`) y entonces no es
  reversible por el runner.

## Módulos nativos y caché

El proceso main de Electron **cachea el código de `backend/services`**. Tras
cambiar un servicio hay que cerrar la ventana, matar `electron.exe` y relanzar
`npm run dev`. Recargar el renderer no basta.

## Reglas de datos

- `data/` contiene la base de desarrollo. **No versionar** cambios en
  `data/farmacia.db` ni en `data/backup_config.json`.
- Los tests usan una BD en memoria (`tests/helpers/testDb.js`), pero
  `resolveDbPath()` sigue apuntando a `data/`. Cualquier servicio que escriba
  archivos (respaldos, config) necesita un seam para redireccionar en tests; si
  no lo tiene, el test pisa la base de desarrollo.
- `.env` no se versiona. Solo existe `.env.example`. Sin `SUPABASE_URL` y
  `SUPABASE_SERVICE_ROLE_KEY`, `syncHabilitado` queda en `false`.
- La `service_role` de Supabase solo vive en el proceso main. Nunca en el
  renderer ni en el bundle móvil.

## Base de datos

- SQLite en desarrollo, PostgreSQL como destino. Las migraciones usan sintaxis
  compatible con SQLite.
- Las migraciones son archivos **numerados** en `backend/database/migrations/`.
  No escribir SQL de esquema en `backend/database/connection.js`.
- Los nombres duplicados en el numbering (`019_catalogo_empaques` /
  `019_rate_limiting`, `020_catalogo_actualizaciones` /
  `020_superadmin_principal`) son un bug conocido: `migrate.js` ordena por
  nombre de archivo y registra por `migration.name`, así que ambos se aplican.

## Convenciones

- Español en identificadores, comentarios y mensajes de error orientados al usuario.
- Los controladores devuelven `{ ok, data }` o `{ ok: false, error }`, y
  capturan excepciones con su helper `manejarError`.
- **Si un servicio es async, el controlador que lo llama debe ser async con
  `await`.** Un controlador síncrono que envuelve una Promise en `{ ok, data }`
  no produce un *thenable*, así que `ipcMain.handle` no lo resuelve y Electron
  serializa la Promise como `{}` por *structured clone*. El síntoma es un
  objeto vacío donde el renderer esperaba un array. Ver `docs/backups.md`.
- Las acciones auditables se declaran en `shared/constants.js` (`AUDIT_ACTIONS`).
  Si `auditoria.accion` es `NOT NULL`, referenciar una clave inexistente produce
  `undefined` y la escritura falla con un error genérico.

## Documentación

- `docs/backups.md` — módulo de respaldos: arquitectura, bugs corregidos y tests.

## Verificación antes de dar por terminado

```powershell
npm run lint       # 0 errores (hay warnings preexistentes)
$env:ELECTRON_RUN_AS_NODE = "1"   # better-sqlite3: ver arriba
```

Hay tests que fallan en la línea base (`La unidad de medida es obligatoria`, entre
otros). Compara contra la línea base antes de asumir que un fallo es tuyo.