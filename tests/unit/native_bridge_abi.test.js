const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const root = path.join(__dirname, '..', '..');
const cscCandidates = [
  'C:\\Windows\\Microsoft.NET\\Framework64\\v4.0.30319\\csc.exe',
  'C:\\Windows\\Microsoft.NET\\Framework\\v4.0.30319\\csc.exe'
];

test('contrato estructural y marshalling Wacom sin invocar DLL ni puente', (t) => {
  const csc = cscCandidates.find(fs.existsSync);
  if (!csc) return t.skip('No está disponible csc.exe de .NET Framework.');
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'farmacia-wacom-abi-'));
  try {
    const salida = path.join(temp, 'contract-test.exe');
    const compilacion = spawnSync(csc, [
      '/nologo', '/platform:x64', '/optimize', '/target:exe',
      '/main:WacomInteropContract', '/reference:System.Numerics.dll',
      '/reference:System.Drawing.dll', '/reference:System.Core.dll',
      `/out:${salida}`,
      path.join(root, 'native', 'stu-bridge', 'stu-bridge.cs'),
      path.join(root, 'tests', 'helpers', 'wacomInteropContract.cs')
    ], { encoding: 'utf8', windowsHide: true });
    assert.equal(compilacion.status, 0, compilacion.stdout + compilacion.stderr);
    const ejecucion = spawnSync(salida, [], { encoding: 'utf8', windowsHide: true });
    assert.equal(ejecucion.status, 0, ejecucion.stdout + ejecucion.stderr);
    assert.match(ejecucion.stdout, /sin invocar P\/Invoke/);
  } finally {
    fs.rmSync(temp, { recursive: true, force: true });
  }
});
