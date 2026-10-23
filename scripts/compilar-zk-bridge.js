// Compila native/zk-bridge/zk-bridge.cs con el csc.exe incluido en
// Windows (.NET Framework 64 bits). Sin descargas ni NuGet: P/Invoke
// directo a C:\Windows\System32\libzkfp.dll (resuelve por el sistema).
//
// Salida: native/zk-bridge/bin/zk-bridge.exe (x64).
const { spawnSync } = require('child_process');
const path = require('path');
const fs = require('fs');

const raiz = path.join(__dirname, '..');
const dirPuente = path.join(raiz, 'native', 'zk-bridge');
const dirBin = path.join(dirPuente, 'bin');
const fuente = path.join(dirPuente, 'zk-bridge.cs');
const salida = path.join(dirBin, 'zk-bridge.exe');

const cscCandidatos = [
  'C:\\Windows\\Microsoft.NET\\Framework64\\v4.0.30319\\csc.exe',
  'C:\\Windows\\Microsoft.NET\\Framework\\v4.0.30319\\csc.exe'
];

function principal() {
  if (!fs.existsSync(fuente)) {
    console.error('[zk-bridge] No existe ' + fuente);
    process.exit(1);
  }
  const csc = cscCandidatos.find((ruta) => fs.existsSync(ruta));
  if (!csc) {
    console.error('[zk-bridge] No se encontró csc.exe de .NET Framework.');
    process.exit(1);
  }
  if (!fs.existsSync(dirBin)) fs.mkdirSync(dirBin, { recursive: true });
  console.log('[zk-bridge] Compilando con ' + csc + ' ...');
  const res = spawnSync(
    csc,
    ['/nologo', '/platform:x64', '/optimize', '/target:exe', '/out:' + salida, fuente],
    { stdio: 'inherit' }
  );
  if (res.status !== 0) {
    console.error('[zk-bridge] Falló la compilación.');
    process.exit(res.status || 1);
  }
  console.log('[zk-bridge] OK -> ' + salida);
}

if (require.main === module) principal();
module.exports = {};
