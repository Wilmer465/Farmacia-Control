# Ejecuta los escenarios del arnés de Etapa 4.2 con SQLite aislada.
# No usa data/farmacia.db ni data/backups.
$ErrorActionPreference = 'Stop'

$repo = (Resolve-Path (Join-Path $PSScriptRoot '..\..\..')).Path
$electron = Join-Path $repo 'node_modules\electron\dist\electron.exe'
$harness = Join-Path $PSScriptRoot 'main_harness.js'
$base = Join-Path $env:TEMP ('farmacia-etapa42\harness-' + (Get-Date -Format 'yyyyMMdd-HHmmss'))

if (-not (Test-Path $electron)) { throw "No existe $electron" }
if (-not (Test-Path (Join-Path $repo 'dist\renderer\index.html'))) {
  throw 'Falta dist/renderer/index.html. Ejecute: corepack pnpm run build:react'
}

$envAnterior = @{
  NODE_ENV = $env:NODE_ENV
  FARMACIA_TEST_DB_PATH = $env:FARMACIA_TEST_DB_PATH
  HARNESS_ROOT = $env:HARNESS_ROOT
  HARNESS_SCENARIO = $env:HARNESS_SCENARIO
  HARNESS_RESULT_PATH = $env:HARNESS_RESULT_PATH
}
Remove-Item Env:\ELECTRON_RUN_AS_NODE -ErrorAction SilentlyContinue
$env:NODE_ENV = 'test'

$escenarios = @('ipc', 'restore-valid', 'restore-foreign', 'restore-corrupt')
$resultados = @()
foreach ($escenario in $escenarios) {
  $root = Join-Path $base $escenario
  New-Item -ItemType Directory -Path $root -Force | Out-Null
  $env:FARMACIA_TEST_DB_PATH = Join-Path $root 'farmacia.db'
  $env:HARNESS_ROOT = $root
  $env:HARNESS_SCENARIO = $escenario
  $env:HARNESS_RESULT_PATH = Join-Path $root 'result.json'
  $out = Join-Path $root 'out.log'
  $err = Join-Path $root 'err.log'

  Write-Host "=== $escenario ==="
  $proceso = Start-Process -FilePath $electron -ArgumentList @($harness) `
    -WorkingDirectory $repo -PassThru -RedirectStandardOutput $out -RedirectStandardError $err
  if (-not $proceso.WaitForExit(180000)) {
    Stop-Process -Id $proceso.Id -Force -ErrorAction SilentlyContinue
    throw "El escenario $escenario superó 180 s."
  }
  $resultado = $env:HARNESS_RESULT_PATH
  if (-not (Test-Path $resultado)) {
    Get-Content $err -Tail 30 -ErrorAction SilentlyContinue
    throw "El escenario $escenario no generó result.json."
  }
  Get-Content $resultado -Raw
  $resultados += $resultado
}

foreach ($clave in $envAnterior.Keys) {
  if ($null -eq $envAnterior[$clave]) { Remove-Item "Env:\$clave" -ErrorAction SilentlyContinue }
  else { Set-Item "Env:\$clave" $envAnterior[$clave] }
}

Write-Host ''
Write-Host "Resultados en: $base"
$resultados
