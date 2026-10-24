$raizProyecto = Split-Path -Parent $PSScriptRoot
$ejecutableElectron = Join-Path $raizProyecto 'node_modules/electron/dist/electron.exe'
$teniaModoNodeElectron = Test-Path Env:ELECTRON_RUN_AS_NODE
$modoNodeAnterior = $env:ELECTRON_RUN_AS_NODE
$archivoFinalizacion = Join-Path ([System.IO.Path]::GetTempPath()) ('farmacia-dian-' + [guid]::NewGuid().ToString('N') + '.complete')
$salidaEstandar = Join-Path ([System.IO.Path]::GetTempPath()) ('farmacia-dian-' + [guid]::NewGuid().ToString('N') + '.stdout')
$salidaError = Join-Path ([System.IO.Path]::GetTempPath()) ('farmacia-dian-' + [guid]::NewGuid().ToString('N') + '.stderr')
$archivoRunner = Join-Path $raizProyecto 'tests/integration/runDianElectron.js'
$codigoSalida = 1

if (-not (Test-Path -LiteralPath $ejecutableElectron)) {
  throw 'No se encontró Electron. Instale las dependencias del proyecto antes de ejecutar las pruebas DIAN.'
}

Push-Location $raizProyecto
try {
  $env:ELECTRON_RUN_AS_NODE = '1'
  $env:DIAN_TEST_COMPLETION_FILE = $archivoFinalizacion
  $proceso = Start-Process -FilePath $ejecutableElectron -ArgumentList @($archivoRunner) -Wait -PassThru -NoNewWindow -RedirectStandardOutput $salidaEstandar -RedirectStandardError $salidaError
  if (Test-Path -LiteralPath $salidaEstandar) { Get-Content -LiteralPath $salidaEstandar }
  if (Test-Path -LiteralPath $salidaError) { Get-Content -LiteralPath $salidaError | Write-Error }
  if ($proceso.ExitCode -eq 0 -and (Test-Path -LiteralPath $archivoFinalizacion)) {
    $codigoSalida = 0
  }
  else {
    Write-Error "Electron terminó con código $($proceso.ExitCode) o sin confirmar la finalización de la suite."
    $codigoSalida = 1
  }
}
finally {
  Pop-Location
  Remove-Item -LiteralPath $archivoFinalizacion -ErrorAction SilentlyContinue
  Remove-Item -LiteralPath $salidaEstandar -ErrorAction SilentlyContinue
  Remove-Item -LiteralPath $salidaError -ErrorAction SilentlyContinue
  Remove-Item Env:DIAN_TEST_COMPLETION_FILE -ErrorAction SilentlyContinue
  if ($teniaModoNodeElectron) {
    $env:ELECTRON_RUN_AS_NODE = $modoNodeAnterior
  }
  else {
    Remove-Item Env:ELECTRON_RUN_AS_NODE -ErrorAction SilentlyContinue
  }
}

exit $codigoSalida
