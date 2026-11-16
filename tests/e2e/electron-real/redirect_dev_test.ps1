# Prueba de redirección bloqueada por electron/main.js en modo desarrollo.
#
# En producción el renderer solo puede cargar el archivo exacto index.html, así
# que un redirect HTTP no es alcanzable. Para ejercitar el mismo handler
# `will-redirect` se ejecuta una COPIA del proyecto en modo desarrollo contra un
# servidor local en el puerto 5173 que responde 302 a https://example.com/.
# La copia usa su propio data/ y su propio userData: no toca data/farmacia.db.
$ErrorActionPreference = 'Stop'

$repo = (Resolve-Path (Join-Path $PSScriptRoot '..\..\..')).Path
$electron = Join-Path $repo 'node_modules\electron\dist\electron.exe'
$root = Join-Path $env:TEMP ('farmacia-etapa42\redirect-' + (Get-Date -Format 'yyyyMMdd-HHmmss'))
$appDir = Join-Path $root 'app'
$serverPath = Join-Path $root 'fake-vite.mjs'
$server = $null
$appProcess = $null

try {
  if (-not (Test-Path $electron)) { throw "No existe $electron" }
  $ocupado = Get-NetTCPConnection -LocalPort 5173 -State Listen -ErrorAction SilentlyContinue
  if ($ocupado) { throw 'El puerto 5173 está ocupado; cierre Vite antes de ejecutar esta prueba.' }

  New-Item -ItemType Directory -Path $appDir -Force | Out-Null
  foreach ($carpeta in @('backend', 'electron', 'shared', 'dist')) {
    Copy-Item (Join-Path $repo $carpeta) -Destination $appDir -Recurse -Force
  }
  Copy-Item (Join-Path $repo 'package.json') -Destination $appDir
  New-Item -ItemType Directory -Path (Join-Path $appDir 'data') -Force | Out-Null
  cmd /c mklink /J "$appDir\node_modules" "$repo\node_modules" | Out-Null

  @'
import http from 'node:http';
const server = http.createServer((req, res) => {
  console.log('REQ ' + req.url);
  res.writeHead(302, { Location: 'https://example.com/' });
  res.end('redirect');
});
server.listen(5173, '127.0.0.1', () => console.log('LISTO'));
'@ | Set-Content -Path $serverPath -Encoding UTF8

  $server = Start-Process -FilePath (Get-Command node).Source -ArgumentList $serverPath `
    -PassThru -RedirectStandardOutput (Join-Path $root 'vite-out.log') `
    -RedirectStandardError (Join-Path $root 'vite-err.log')
  Start-Sleep -Seconds 2

  $envAnterior = $env:NODE_ENV
  $env:NODE_ENV = 'development'
  Remove-Item Env:\ELECTRON_RUN_AS_NODE -ErrorAction SilentlyContinue
  $appProcess = Start-Process -FilePath $electron `
    -ArgumentList @($appDir, '--remote-debugging-port=9334', "--user-data-dir=$(Join-Path $root 'userdata')") `
    -WorkingDirectory $appDir -PassThru `
    -RedirectStandardOutput (Join-Path $root 'app-out.log') `
    -RedirectStandardError (Join-Path $root 'app-err.log')
  Start-Sleep -Seconds 15

  $err = Get-Content (Join-Path $root 'app-err.log') -Raw -ErrorAction SilentlyContinue
  $bloqueada = $err -match 'Navegación bloqueada: https://example\.com/'
  $resultado = [ordered]@{
    escenario = 'redirect-dev'
    root = $root
    bloqueada = $bloqueada
    linea = ($err -split "`n" | Where-Object { $_ -match 'Navegación bloqueada' } | Select-Object -First 1)
    evidencia = (Join-Path $root 'app-err.log')
  }
  $resultado | ConvertTo-Json -Depth 4
  if (-not $bloqueada) { throw 'No se observó el bloqueo del redirect.' }
} finally {
  if ($appProcess -and -not $appProcess.HasExited) { Stop-Process -Id $appProcess.Id -Force -ErrorAction SilentlyContinue }
  if ($server -and -not $server.HasExited) { Stop-Process -Id $server.Id -Force -ErrorAction SilentlyContinue }
  if ($envAnterior) { $env:NODE_ENV = $envAnterior } else { Remove-Item Env:\NODE_ENV -ErrorAction SilentlyContinue }
}
