'use strict';

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const assert = require('node:assert/strict');
const { describe, test, afterEach } = require('node:test');
const crypto = require('node:crypto');

const {
  ESTADO_CLAVE,
  detectarEstadoClave,
  obtenerClave,
  generarClaveNueva,
  inicializarClaveRespaldo,
  crearManifiestoRespaldo,
  setClaveManifiestoPath,
  claveId
} = require('../../backend/services/backupManifest');

// Electron simulado con safeStorage reversible, solo para permitir escribir y
// leer claves en pruebas sin exponer texto plano en producción.
const electronPrueba = {
  app: { getPath: () => 'test-user-data' },
  safeStorage: {
    isEncryptionAvailable: () => true,
    encryptString: (texto) => Buffer.from(`enc:${texto}`, 'utf8').toString('base64'),
    decryptString: (cifrado) => {
      const texto = Buffer.from(String(cifrado), 'base64').toString('utf8');
      if (!texto.startsWith('enc:')) throw new Error('No se pudo descifrar la clave local de autenticidad de respaldos.');
      return texto.slice(4);
    }
  }
};

// Electron simulado que falla al descifrar (simula UNDECRYPTABLE).
const electronNoDescifra = {
  app: { getPath: () => 'test-user-data' },
  safeStorage: {
    isEncryptionAvailable: () => true,
    encryptString: (texto) => Buffer.from(`enc:${texto}`, 'utf8').toString('base64'),
    decryptString: () => {
      throw new Error('No se pudo descifrar la clave local de autenticidad de respaldos.');
    }
  }
};

function dirTemporal() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'backup-clave-hmac-'));
}

function rutaClave(dir) {
  return path.join(dir, 'backup-signing.key');
}

function escribirClavePlana(ruta, bytes) {
  fs.writeFileSync(ruta, bytes);
}

function escribirClaveCifrada(ruta, claveBase64, electron) {
  const cifrado = electron.safeStorage.encryptString(claveBase64);
  fs.writeFileSync(ruta, cifrado);
}

function escribirRespaldoFalso(dir) {
  fs.writeFileSync(path.join(dir, 'farmacia_backup_sede_1_20260101_000000.db'), Buffer.alloc(16));
}

function escribirManifestofalso(dir) {
  fs.writeFileSync(path.join(dir, 'farmacia_backup_sede_1_20260101_000000.db.manifest.json'), '{}');
}

describe('AC-4.2-03 — detección y generación segura de la clave HMAC de respaldos', () => {
  const dirs = [];

  afterEach(() => {
    setClaveManifiestoPath(null);
    for (const dir of dirs) {
      try { fs.rmSync(dir, { recursive: true, force: true }); } catch { /* best-effort */ }
    }
    dirs.length = 0;
    delete process.env.FARMACIA_TEST_DB_PATH;
  });

  test('estado NEW: no existe clave ni evidencia de respaldos previos', () => {
    const dir = dirTemporal();
    dirs.push(dir);
    setClaveManifiestoPath(rutaClave(dir));

    const estado = detectarEstadoClave({ carpetaRespaldos: dir });
    assert.equal(estado.estado, ESTADO_CLAVE.NEW);
    assert.equal(estado.motivo, 'Instalación nueva sin evidencia de respaldos previos.');
    assert.equal(fs.existsSync(rutaClave(dir)), false);
  });

  test('instalación nueva: inicializarClaveRespaldo genera una clave una sola vez', async () => {
    const dir = dirTemporal();
    dirs.push(dir);
    setClaveManifiestoPath(rutaClave(dir));

    const resultado = await inicializarClaveRespaldo({ electron: electronPrueba, carpetaRespaldos: dir });
    assert.equal(resultado.estado, ESTADO_CLAVE.NEW);
    assert.ok(Buffer.isBuffer(resultado.clave));
    assert.equal(resultado.clave.length, 32);
    assert.equal(fs.existsSync(rutaClave(dir)), true);

    // No se puede generar otra clave mientras exista una.
    assert.throws(() => generarClaveNueva({ electron: electronPrueba }), /Ya existe una clave local de respaldos/);
  });

  test('estado EXISTING: clave válida y recuperable', async () => {
    const dir = dirTemporal();
    dirs.push(dir);
    setClaveManifiestoPath(rutaClave(dir));
    escribirClavePlana(rutaClave(dir), crypto.randomBytes(32));

    const estado = detectarEstadoClave({ carpetaRespaldos: dir });
    assert.equal(estado.estado, ESTADO_CLAVE.EXISTING);
    assert.equal(estado.motivo, 'Clave válida y recuperable.');

    const clave = await obtenerClave({ electron: electronPrueba });
    assert.equal(clave.length, 32);
  });

  test('clave cifrada válida: inicializarClaveRespaldo recupera la clave descifrada', async () => {
    const dir = dirTemporal();
    dirs.push(dir);
    process.env.FARMACIA_TEST_DB_PATH = path.join(dir, 'farmacia.db');
    setClaveManifiestoPath(null);
    const claveEsperada = crypto.randomBytes(32);
    escribirClaveCifrada(rutaClave(dir), claveEsperada.toString('base64'), electronPrueba);

    const estado = detectarEstadoClave({ rutaClave: rutaClave(dir), electron: electronPrueba });
    assert.equal(estado.estado, ESTADO_CLAVE.EXISTING);

    const resultado = await inicializarClaveRespaldo({ electron: electronPrueba, rutaClave: rutaClave(dir) });
    assert.equal(resultado.estado, ESTADO_CLAVE.EXISTING);
    assert.deepStrictEqual(resultado.clave, claveEsperada);
  });

  test('clave descifrada con longitud incorrecta: estado CORRUPT (no UNDECRYPTABLE)', async () => {
    const dir = dirTemporal();
    dirs.push(dir);
    process.env.FARMACIA_TEST_DB_PATH = path.join(dir, 'farmacia.db');
    setClaveManifiestoPath(null);
    // Archivo cifrado que al descifrar produce un texto cuya clave base64 no
    // tiene 32 bytes.
    escribirClaveCifrada(rutaClave(dir), 'abc', electronPrueba);

    const estado = detectarEstadoClave({ rutaClave: rutaClave(dir), electron: electronPrueba });
    assert.equal(estado.estado, ESTADO_CLAVE.CORRUPT);
    assert.match(estado.motivo, /corrupta/);

    assert.throws(() => obtenerClave({ rutaClave: rutaClave(dir), electron: electronPrueba }), /corrupta/);
  });

  test('estado UNDECRYPTABLE: existe el archivo pero no se puede descifrar con safeStorage', async () => {
    const dir = dirTemporal();
    dirs.push(dir);
    process.env.FARMACIA_TEST_DB_PATH = path.join(dir, 'farmacia.db');
    setClaveManifiestoPath(null);
    escribirClavePlana(rutaClave(dir), Buffer.from('enc:contenido-no-descifrable', 'utf8'));

    const estado = detectarEstadoClave({ rutaClave: rutaClave(dir), electron: electronNoDescifra });
    assert.equal(estado.estado, ESTADO_CLAVE.UNDECRYPTABLE);
    assert.match(estado.motivo, /descifrar/);

    assert.throws(() => obtenerClave({ rutaClave: rutaClave(dir), electron: electronNoDescifra }), /descifrar/);
  });

  test('estado LOST: falta la clave pero existen respaldos previos; nunca se genera automáticamente', async () => {
    const dir = dirTemporal();
    dirs.push(dir);
    setClaveManifiestoPath(rutaClave(dir));
    // No hay archivo de clave, pero sí un respaldo previo.
    escribirRespaldoFalso(dir);

    const estado = detectarEstadoClave({ carpetaRespaldos: dir });
    assert.equal(estado.estado, ESTADO_CLAVE.LOST);
    assert.match(estado.motivo, /Falta la clave y existen respaldos o manifiestos previos/);
    assert.equal(fs.existsSync(rutaClave(dir)), false);

    // obtenerClave no genera nada; lanza.
    assert.throws(() => obtenerClave({ electron: electronPrueba }), /No existe la clave local de autenticidad de respaldos/);

    // crearManifiestoRespaldo se bloquea antes de firmar, sin generar clave.
    await assert.rejects(
      () => crearManifiestoRespaldo(path.join(dir, 'cualquier.db'), { nombre: 'x.db', carpetaRespaldos: dir, electron: electronPrueba }),
      /No existe la clave local de autenticidad de respaldos/
    );

    // Queda declarada como LOST y no aparece una clave generada implícitamente.
    const estado2 = detectarEstadoClave({ carpetaRespaldos: dir });
    assert.equal(estado2.estado, ESTADO_CLAVE.LOST);
    assert.equal(fs.existsSync(rutaClave(dir)), false);
  });

  test('estado LOST con manifiesto previo (sin respaldo .db)', async () => {
    const dir = dirTemporal();
    dirs.push(dir);
    setClaveManifiestoPath(rutaClave(dir));
    escribirManifestofalso(dir);

    const estado = detectarEstadoClave({ carpetaRespaldos: dir });
    assert.equal(estado.estado, ESTADO_CLAVE.LOST);
    assert.equal(fs.existsSync(rutaClave(dir)), false);
    assert.throws(() => obtenerClave({ electron: electronPrueba }), /No existe la clave local de autenticidad de respaldos/);
  });

  test('estado CORRUPT: existe el archivo de clave pero no tiene 32 bytes', async () => {
    const dir = dirTemporal();
    dirs.push(dir);
    setClaveManifiestoPath(rutaClave(dir));
    escribirClavePlana(rutaClave(dir), Buffer.from('clave-corta'));

    const estado = detectarEstadoClave({ carpetaRespaldos: dir });
    assert.equal(estado.estado, ESTADO_CLAVE.CORRUPT);
    assert.match(estado.motivo, /corrupta/);

    assert.throws(() => obtenerClave({ electron: electronPrueba }), /corrupta/);
  });

  test('obtenerClave nunca genera una clave silenciosamente', async () => {
    const dir = dirTemporal();
    dirs.push(dir);
    setClaveManifiestoPath(rutaClave(dir));
    assert.equal(fs.existsSync(rutaClave(dir)), false);

    assert.throws(() => obtenerClave({ electron: electronPrueba }), /No existe la clave local de autenticidad de respaldos/);
    assert.equal(fs.existsSync(rutaClave(dir)), false, 'no se creó clave automáticamente');
  });

  test('ausencia de clave durante la creación de manifiestos: se bloquea sin tocar respaldos existentes', async () => {
    const dir = dirTemporal();
    dirs.push(dir);
    setClaveManifiestoPath(rutaClave(dir));
    escribirRespaldoFalso(dir); // evidencia previa => LOST, y no hay clave

    await assert.rejects(
      () => crearManifiestoRespaldo(path.join(dir, 'farmacia_backup_sede_1_20260101_000000.db'), {
        nombre: 'farmacia_backup_sede_1_20260101_000000.db',
        carpetaRespaldos: dir,
        electron: electronPrueba
      }),
      /No existe la clave local de autenticidad de respaldos/
    );

    // El respaldo existente no se modificó ni se generó clave.
    assert.equal(fs.existsSync(rutaClave(dir)), false);
    assert.equal(fs.existsSync(path.join(dir, 'farmacia_backup_sede_1_20260101_000000.db')), true);
  });

  test('generarClaveNueva no sobrescribe ni elimina una clave existente', async () => {
    const dir = dirTemporal();
    dirs.push(dir);
    setClaveManifiestoPath(rutaClave(dir));
    const original = crypto.randomBytes(32);
    escribirClavePlana(rutaClave(dir), original);

    assert.throws(() => generarClaveNueva({ electron: electronPrueba }), /Ya existe una clave local de respaldos/);
    assert.deepStrictEqual(await obtenerClave({ electron: electronPrueba }), original);
  });

  test('claveId es estable y determinista para la misma clave', () => {
    const clave = crypto.randomBytes(32);
    const id1 = claveId(clave);
    const id2 = claveId(clave);
    assert.equal(id1, id2);
    assert.equal(id1.length, 16);
  });
});
