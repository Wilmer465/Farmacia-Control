# Arnés Electron real — Etapa 4.2

Estos archivos permiten reproducir las comprobaciones de la Etapa 4.2 sin tocar
la base de desarrollo. Todo se ejecuta bajo Electron 32 (ABI 128 de
`better-sqlite3`) y con una SQLite aislada en `%TEMP%`.

## Requisitos

- Ejecutar desde la raíz del repositorio.
- Tener `dist/renderer/index.html` construido (`corepack pnpm run build:react`).
- No definir `ELECTRON_RUN_AS_NODE` (el arnés necesita el proceso main real).

## Escenarios

| Escenario | Qué comprueba |
|---|---|
| `ipc` | Identidad `senderFrame`/`mainFrame`, iframe con preload forzado, origen HTTP externo, saneamiento de errores, apertura temporal de documentos y rechazo de nombres de respaldo inválidos. |
| `restore-valid` | Respaldo real creado por la app, marcador posterior y restauración: el marcador desaparece. |
| `restore-foreign` | Un SQLite ajeno con nombre de respaldo válido: se comprueba si la app lo acepta. |
| `restore-corrupt` | Un archivo corrupto con nombre de respaldo válido: debe rechazarse y la base activa debe quedar intacta. |

## Ejecución manual de un escenario

```powershell
$root = Join-Path $env:TEMP "farmacia-etapa42-ipc"
New-Item -ItemType Directory -Path $root -Force | Out-Null
$env:NODE_ENV = 'test'
$env:FARMACIA_TEST_DB_PATH = Join-Path $root 'farmacia.db'
$env:HARNESS_ROOT = $root
$env:HARNESS_SCENARIO = 'ipc'
$env:HARNESS_RESULT_PATH = Join-Path $root 'result.json'
& .\node_modules\electron\dist\electron.exe .\tests\e2e\electron-real\main_harness.js
Get-Content $env:HARNESS_RESULT_PATH -Raw
```

Para todos los escenarios:

```powershell
.\tests\e2e\electron-real\run_harness.ps1
```

El script imprime la ruta de cada `result.json`. Cada ejecución usa una carpeta
distinta bajo `%TEMP%\farmacia-etapa42\harness-*`; no escribe en `data/`.

## Notas

- El preload de producción no se modifica. El arnés añade un segundo preload
  (`harness-preload.js`) mediante `session.setPreloads()` para exponer canales de
  diagnóstico bajo `window.__harness`.
- El `app` que se inyecta a `registerIpcHandlers` es un doble de prueba: evita
  reiniciar Electron durante la restauración y redirige los documentos temporales
  a la carpeta aislada. La lógica de negocio y el preload son los reales.
- `restore-foreign` deja la base aislada reemplazada a propósito, para demostrar
  el hallazgo. Es descartable.
