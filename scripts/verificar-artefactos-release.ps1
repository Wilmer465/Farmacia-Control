[CmdletBinding()]
param(
  [Parameter(Mandatory = $true)]
  [string]$ExpectedPublisher,
  [string]$DistRoot = (Join-Path (Split-Path $PSScriptRoot -Parent) 'dist'),
  [Parameter(Mandatory = $true)]
  [string]$InstalledAppRoot,
  [string]$ExceptionsPath = (Join-Path $PSScriptRoot 'authenticode-exceptions.json'),
  [string]$SignerPolicyPath = (Join-Path $PSScriptRoot 'authenticode-signers.psd1')
)

$ErrorActionPreference = 'Stop'
$extensions = @('.exe', '.dll', '.node')

function Test-PeFile([string]$Path) {
  $stream = [System.IO.File]::OpenRead($Path)
  try {
    if ($stream.Length -lt 64) { return $false }
    $reader = [System.IO.BinaryReader]::new($stream)
    if ($reader.ReadUInt16() -ne 0x5A4D) { return $false }
    $stream.Position = 0x3C
    $peOffset = $reader.ReadInt32()
    if ($peOffset -lt 64 -or $peOffset -gt ($stream.Length - 4)) { return $false }
    $stream.Position = $peOffset
    return ($reader.ReadUInt32() -eq 0x00004550)
  }
  finally { $stream.Dispose() }
}

$ownExePatterns = @(
  '^Farmacia Control\.exe$',
  '^stu-bridge\.exe$',
  '^zk-bridge\.exe$',
  '^elevate\.exe$',
  '^Farmacia Control-.*-(setup|portable)\.exe$',
  '^unins.*\.exe$'
)

if (-not (Test-Path -LiteralPath $DistRoot -PathType Container)) {
  throw "No existe el directorio de distribución: $DistRoot"
}
$exceptionMap = @{}
if (Test-Path -LiteralPath $ExceptionsPath -PathType Leaf) {
  $exceptionItems = Get-Content -LiteralPath $ExceptionsPath -Raw -Encoding UTF8 | ConvertFrom-Json
  foreach ($item in $exceptionItems) {
    if (-not $item.path -or -not $item.sha256 -or -not $item.source -or -not $item.reason -or -not $item.approvedBy) {
      throw 'Cada excepción requiere path, sha256, source, reason y approvedBy.'
    }
    $exceptionMap[$item.path.ToLowerInvariant()] = $item
  }
}
$signerPolicy = @{}
if (Test-Path -LiteralPath $SignerPolicyPath -PathType Leaf) {
  $signerPolicy = Import-PowerShellDataFile -LiteralPath $SignerPolicyPath
}

$roots = @((Resolve-Path -LiteralPath $DistRoot).Path)
$package = Get-Content -LiteralPath (Join-Path (Split-Path $PSScriptRoot -Parent) 'package.json') -Raw -Encoding UTF8 | ConvertFrom-Json
$resolvedDist = $roots[0]
$requiredDistFiles = @(
  (Join-Path $resolvedDist 'win-unpacked/Farmacia Control.exe'),
  (Join-Path $resolvedDist 'win-unpacked/resources/elevate.exe'),
  (Join-Path $resolvedDist 'win-unpacked/resources/native/stu-bridge/stu-bridge.exe'),
  (Join-Path $resolvedDist 'win-unpacked/resources/native/zk-bridge/zk-bridge.exe'),
  (Join-Path $resolvedDist ("Farmacia Control-$($package.version)-setup.exe")),
  (Join-Path $resolvedDist ("Farmacia Control-$($package.version)-portable.exe"))
)
foreach ($required in $requiredDistFiles) {
  if (-not (Test-Path -LiteralPath $required -PathType Leaf)) { throw "Falta archivo release requerido: $required" }
}
if ($InstalledAppRoot) {
  if (-not (Test-Path -LiteralPath $InstalledAppRoot -PathType Container)) {
    throw "No existe la instalación indicada: $InstalledAppRoot"
  }
  $installedRoot = (Resolve-Path -LiteralPath $InstalledAppRoot).Path
  $uninstaller = Get-ChildItem -LiteralPath $installedRoot -File -Filter 'unins*.exe' -Recurse | Select-Object -First 1
  if (-not $uninstaller) { throw "No se encontró el desinstalador instalado debajo de $installedRoot" }
  $roots += $installedRoot
}
$files = foreach ($root in $roots) {
  Get-ChildItem -LiteralPath $root -File -Recurse | Where-Object {
    $isPe = Test-PeFile $_.FullName
    if (($extensions -contains $_.Extension.ToLowerInvariant()) -and -not $isPe) {
      throw "Archivo con extensión PE, pero cabeceras MZ/PE inválidas: $($_.FullName)"
    }
    $isPe
  }
}
$files = @($files | Sort-Object -Property FullName -Unique)
if ($files.Count -eq 0) { throw 'No se encontraron archivos PE para inventariar.' }

$inventory = foreach ($file in $files) {
  $hash = (Get-FileHash -LiteralPath $file.FullName -Algorithm SHA256).Hash.ToLowerInvariant()
  $signature = Get-AuthenticodeSignature -LiteralPath $file.FullName
  $isOwnExe = $file.Extension -ieq '.exe' -and @($ownExePatterns | Where-Object { $file.Name -match $_ }).Count -gt 0
  $root = $roots | Where-Object { $file.FullName.StartsWith($_, [StringComparison]::OrdinalIgnoreCase) } | Sort-Object Length -Descending | Select-Object -First 1
  $relative = $file.FullName.Substring($root.Length).TrimStart('\', '/')
  $key = $relative.ToLowerInvariant()
  $exception = $exceptionMap[$key]

  if ($signature.Status -eq 'Valid') {
    if ($isOwnExe -and $signature.SignerCertificate.Subject.IndexOf(
      $ExpectedPublisher, [StringComparison]::OrdinalIgnoreCase) -lt 0) {
      throw "Editor inesperado en ejecutable propio: $($file.FullName) [$($signature.SignerCertificate.Subject)]"
    }
    if (-not $isOwnExe) {
      $expectedSigner = $signerPolicy[$relative.Replace('\', '/').ToLowerInvariant()]
      if (-not $expectedSigner) { $expectedSigner = $signerPolicy[$file.Name.ToLowerInvariant()] }
      if (-not $expectedSigner -or $signature.SignerCertificate.Subject -ne $expectedSigner) {
        throw "Editor no inventariado o inesperado para dependencia firmada: $($file.FullName) [$($signature.SignerCertificate.Subject)]"
      }
    }
    if (-not $signature.TimeStamperCertificate) {
      throw "Firma válida sin certificado de timestamp: $($file.FullName)"
    }
    [pscustomobject]@{
      path = $file.FullName; sha256 = $hash; extension = $file.Extension
      status = $signature.Status.ToString(); signer = $signature.SignerCertificate.Subject
      timestamp = $signature.TimeStamperCertificate.Subject; exception = $false
    }
    continue
  }

  if ($isOwnExe) { throw "Ejecutable propio sin firma válida: $($file.FullName) [$($signature.Status)]" }
  if ($signature.Status -ne 'NotSigned') { throw "Firma inválida en PE (no se admite excepción de archivo sin firma): $($file.FullName) [$($signature.Status)]" }
  if (-not $exception) { throw "PE sin firma válida y sin excepción aprobada: $($file.FullName) [$($signature.Status)]" }
  if ($exception.sha256.ToLowerInvariant() -ne $hash) {
    throw "El hash de la excepción no coincide: $($file.FullName)"
  }
  [pscustomobject]@{
    path = $file.FullName; sha256 = $hash; extension = $file.Extension
    status = $signature.Status.ToString(); signer = $null; timestamp = $null
    exception = $true; source = $exception.source; reason = $exception.reason
    approvedBy = $exception.approvedBy
  }
}

$manifest = Join-Path $DistRoot 'authenticode-inventory.json'
$inventory | ConvertTo-Json -Depth 5 | Set-Content -LiteralPath $manifest -Encoding UTF8
Write-Host "Inventario Authenticode: $manifest"
Write-Host "PE comprobados: $($inventory.Count); excepciones aprobadas: $(@($inventory | Where-Object exception).Count)"
Write-Host 'Todas las firmas presentes son válidas; los ejecutables propios y los archivos exigidos cumplen la política.'
