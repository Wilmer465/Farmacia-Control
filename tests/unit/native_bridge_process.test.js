const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const signatureService = require('../../backend/services/signatureService');

function crearDirectorio() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'farmacia-bridge-process-'));
}

function crearScript(dir, contenido) {
  const archivo = path.join(dir, 'helper-fixture.js');
  fs.writeFileSync(archivo, contenido, 'utf8');
  return archivo;
}

test('el ejecutor captura JSON en stdout y diagnóstico en stderr', async () => {
  const dir = crearDirectorio();
  try {
    const script = crearScript(dir, "console.error('diagnostico fixture'); console.log('{\"ok\":true}');");
    const respuesta = await signatureService.ejecutarHelper([script], 5000, process.execPath);
    assert.deepEqual(respuesta, { ok: true });
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('rechaza la terminación con código distinto de cero aunque haya JSON', async () => {
  const dir = crearDirectorio();
  try {
    const script = crearScript(dir, "console.log('{\"ok\":true}'); process.exitCode = 7;");
    await assert.rejects(
      signatureService.ejecutarHelper([script], 5000, process.execPath),
      (error) => error.codigo === 'HELPER_TERMINO_CON_ERROR'
    );
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('propaga la cancelación simulada por el helper y libera el estado de captura', async () => {
  const dir = crearDirectorio();
  const helper = path.join(dir, 'cancelado.cmd');
  fs.writeFileSync(helper,
    '@echo off\r\n@echo {"ok":false,"codigo":"CANCELADO","error":"fixture"}\r\n',
    'utf8');
  signatureService.__setOpcionesSpawn({ shell: true });
  signatureService.setHelperPathForTests(helper);
  try {
    await assert.rejects(signatureService.capturar({}), (error) => error.codigo === 'CANCELADO');
    await assert.rejects(signatureService.capturar({}), (error) => error.codigo === 'CANCELADO');
  } finally {
    signatureService.__setOpcionesSpawn({});
    signatureService.setHelperPathForTests(null);
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('convierte errores de lanzamiento en error del puente', async () => {
  const dir = crearDirectorio();
  try {
    await assert.rejects(
      signatureService.ejecutarHelper([], 5000, dir),
      (error) => error.codigo === 'ERROR_SDK'
    );
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('el timeout termina el helper Node de fixture y no procesa su cierre tardío', async () => {
  const dir = crearDirectorio();
  try {
    const marcador = path.join(dir, 'despues-del-timeout.txt');
    const script = crearScript(dir,
      `const fs = require('node:fs'); setTimeout(() => fs.writeFileSync(${JSON.stringify(marcador)}, 'vivo'), 1200); setInterval(() => {}, 1000);`);
    await assert.rejects(
      signatureService.ejecutarHelper([script], 150, process.execPath),
      (error) => error.codigo === 'TIMEOUT_LOCAL'
    );
    await new Promise((resolve) => setTimeout(resolve, 1400));
    assert.equal(fs.existsSync(marcador), false);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
