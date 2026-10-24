// Diagnóstico manual del ZK9500 con hardware real.
//
// Uso: node scripts/diagnosticar-zk9500.js [--timeout 30]
// Requiere el helper compilado (pnpm run compilar:zk-bridge) y el lector
// conectado. Para `diagnostico` ponga el MISMO dedo dos veces cuando se pida.
//
// Demuestra: SDK disponible, lector detectado, apertura, captura, tamaño de
// plantilla, comparación 1:1 y cierre correcto. No imprime plantillas.
//
// NOTA: este script usa el runtime que lo invoque; con la compilación
// Electron de better-sqlite3 no toca la BD (solo spawn del helper).
const { spawnSync } = require('child_process');
const path = require('path');
const fs = require('fs');

const exe = path.join(__dirname, '..', 'native', 'zk-bridge', 'bin', 'zk-bridge.exe');

function correr(args) {
  console.log('\n$ zk-bridge.exe ' + args.join(' '));
  const res = spawnSync(exe, args, { encoding: 'utf8' });
  const lineas = String(res.stdout || '').split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  const json = lineas.filter((l) => l.startsWith('{')).pop();
  console.log(json || '(sin respuesta JSON)');
  if (res.stderr) console.error(String(res.stderr).slice(0, 500));
  return json;
}

function principal() {
  if (!fs.existsSync(exe)) {
    console.error('Falta el helper. Ejecute: pnpm run compilar:zk-bridge');
    process.exit(1);
  }
  const idx = process.argv.indexOf('--timeout');
  const timeout = idx >= 0 ? process.argv[idx + 1] : '30';
  correr(['detectar']);
  console.log('\nPonga el MISMO dedo dos veces en el lector...');
  correr(['diagnostico', '--timeout', timeout]);
}

if (require.main === module) principal();
module.exports = {};
