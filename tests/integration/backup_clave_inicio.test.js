'use strict';

// Prueba de integración real del inicializador de clave HMAC en el arranque
// (AC-4.2-03, parte 1). Ejercita inicializarClaveRespaldo -> crearManifiestoRespaldo
// -> backupController.crear exactamente como lo haría electron/main.js al iniciar.
// Siempre corre dentro de Electron (ABI nativo de better-sqlite3).
const { test, describe, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');

const { closeDb, setTestDb, getDb } = require('../../backend/database/connection');
const { runMigrations } = require('../../backend/database/migrate');
const { seed } = require('../../backend/database/seeds/seed');
const Database = require('better-sqlite3');

const backupController = require('../../backend/controllers/backupController');
const backupService = require('../../backend/services/backupService');
const {
  inicializarClaveRespaldo,
  detectarEstadoClave,
  setClaveManifiestoPath,
  ESTADO_CLAVE
} = require('../../backend/services/backupManifest');

// Electron simulado con safeStorage reversible, aislado por prueba.
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

function dirTemporal() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'backup-inicio-'));
}

async function prepararDb(tempDir) {
  const dbPath = path.join(tempDir, 'farmacia.db');
  process.env.FARMACIA_TEST_DB_PATH = dbPath;
  closeDb();
  const db = new Database(dbPath);
  try {
    runMigrations(db);
    db.transaction(() => seed({ db, isTest: true }))();
  } finally {
    // Mantener la conexion abierta para que getDb() funcione en el resto de la prueba.
    setTestDb(db);
  }
  return dbPath;
}

function sesionSuperadmin() {
  // Wilmer es SUPERADMIN (sede_id NULL), puede crear respaldos GLOBAL.
  const authService = require('../../backend/services/authService');
  return authService.login('wilmer', 'Wilmer465*');
}

describe('AC-4.2-03 — integración real del inicializador de clave en el arranque', () => {
  const dirs = [];

  afterEach(() => {
    setClaveManifiestoPath(null);
    closeDb();
    delete process.env.FARMACIA_TEST_DB_PATH;
    for (const dir of dirs) {
      try { fs.rmSync(dir, { recursive: true, force: true }); } catch { /* best-effort */ }
    }
    dirs.length = 0;
  });

  test('arranque sin clave: las operaciones de respaldo quedan bloqueadas hasta inicializar', async () => {
    const dir = dirTemporal();
    dirs.push(dir);
    const dbPath = await prepararDb(dir);
    const respaldosDir = path.join(dir, 'backups');
    const claveDir = path.join(dir, 'clave');
    fs.mkdirSync(respaldosDir, { recursive: true });
    fs.mkdirSync(claveDir, { recursive: true });

    // Configura rutas exactamente como haria main.js al arrancar.
    backupService.setDirectorioRespaldos(respaldosDir);
    backupService.setClaveManifiestoPath(path.join(claveDir, 'backup-signing.key'));
    assert.equal(fs.existsSync(path.join(claveDir, 'backup-signing.key')), false);

    // Sin clave, crear un respaldo debe fallar (bloqueado).
    const sesion = sesionSuperadmin();
    const sinClave = await backupController.crear(sesion, {});
    assert.equal(sinClave.ok, false);
    assert.ok(typeof sinClave.error === 'string' && sinClave.error.length > 0);

    // Estado detectado: NEW (instalacion nueva, sin evidencia previa).
    const estado = detectarEstadoClave({ carpetaRespaldos: respaldosDir });
    assert.equal(estado.estado, ESTADO_CLAVE.NEW);

    // Inicializador del arranque genera la clave (NEW, sin respaldos previos).
    const resultado = await inicializarClaveRespaldo({
      electron: electronPrueba,
      carpetaRespaldos: respaldosDir
    });
    assert.equal(resultado.estado, ESTADO_CLAVE.NEW);
    assert.equal(resultado.clave.length, 32);
    assert.equal(fs.existsSync(path.join(claveDir, 'backup-signing.key')), true);

    // Tras la inicializacion, crear un respaldo funciona.
    const conClave = await backupController.crear(sesion, {});
    assert.equal(conClave.ok, true);
    assert.ok(conClave.data.nombre);
    assert.ok(conClave.data.firma);
  });

  test('arranque con respaldos previos pero sin clave: LOST, nunca genera clave automaticamente', async () => {
    const dir = dirTemporal();
    dirs.push(dir);
    const dbPath = await prepararDb(dir);
    const respaldosDir = path.join(dir, 'backups');
    const claveDir = path.join(dir, 'clave');
    fs.mkdirSync(respaldosDir, { recursive: true });
    fs.mkdirSync(claveDir, { recursive: true });

    // Deja un respaldo previo sin clave: evidencia de datos existentes.
    fs.writeFileSync(
      path.join(respaldosDir, 'farmacia_backup_sede_1_20260101_000000.db'),
      Buffer.alloc(16)
    );

    backupService.setDirectorioRespaldos(respaldosDir);
    backupService.setClaveManifiestoPath(path.join(claveDir, 'backup-signing.key'));

    // Estado LOST: falta clave pero hay respaldos previos.
    const estado = detectarEstadoClave({ carpetaRespaldos: respaldosDir });
    assert.equal(estado.estado, ESTADO_CLAVE.LOST);

    // El inicializador no genera clave (LOST no es NEW).
    assert.throws(
      () => inicializarClaveRespaldo({ electron: electronPrueba, carpetaRespaldos: respaldosDir }),
      /No se puede inicializar la clave de respaldo/
    );

    // Sin clave, crear respaldo sigue bloqueado.
    const sesion = sesionSuperadmin();
    const resultado = await backupController.crear(sesion, {});
    assert.equal(resultado.ok, false);
    assert.match(resultado.error, /No se puede firmar el respaldo/);

    // El respaldo preexistente no se toco ni se genero clave.
    assert.equal(fs.existsSync(path.join(claveDir, 'backup-signing.key')), false);
    assert.equal(fs.existsSync(path.join(respaldosDir, 'farmacia_backup_sede_1_20260101_000000.db')), true);
  });

  test('safeStorage no disponible: no genera clave ni clasifica como NEW', async () => {
    const dir = dirTemporal();
    dirs.push(dir);
    await prepararDb(dir);
    const respaldosDir = path.join(dir, 'backups');
    const claveDir = path.join(dir, 'clave');
    fs.mkdirSync(respaldosDir, { recursive: true });
    fs.mkdirSync(claveDir, { recursive: true });

    backupService.setDirectorioRespaldos(respaldosDir);
    backupService.setClaveManifiestoPath(path.join(claveDir, 'backup-signing.key'));

    // Electron sin cifrado disponible.
    const electronSinCifrado = {
      app: { getPath: () => 'test-user-data' },
      safeStorage: { isEncryptionAvailable: () => false }
    };

    // Sin clave y sin safeStorage: no se genera nada.
    assert.throws(
      () => inicializarClaveRespaldo({ electron: electronSinCifrado, carpetaRespaldos: respaldosDir }),
      /No se puede inicializar la clave de respaldo/
    );
    assert.equal(fs.existsSync(path.join(claveDir, 'backup-signing.key')), false);

    // Las operaciones de respaldo quedan bloqueadas.
    const sesion = sesionSuperadmin();
    const resultado = await backupController.crear(sesion, {});
    assert.equal(resultado.ok, false);
    assert.ok(typeof resultado.error === 'string' && resultado.error.length > 0);
  });

  test('clave existente en texto plano no se sobrescribe ni elimina al iniciar', async () => {
    const dir = dirTemporal();
    dirs.push(dir);
    await prepararDb(dir);
    const respaldosDir = path.join(dir, 'backups');
    const claveDir = path.join(dir, 'clave');
    fs.mkdirSync(respaldosDir, { recursive: true });
    fs.mkdirSync(claveDir, { recursive: true });

    // Clave historica en texto plano (no cifrada con safeStorage), simulando una
    // instalacion anterior que no usaba cifrado del SO.
    const claveHistorica = crypto.randomBytes(32);
    fs.writeFileSync(path.join(claveDir, 'backup-signing.key'), claveHistorica);

    backupService.setDirectorioRespaldos(respaldosDir);
    backupService.setClaveManifiestoPath(path.join(claveDir, 'backup-signing.key'));

    // Con override de ruta, se lee tal cual (modo standalone/prueba).
    const estado = detectarEstadoClave({ carpetaRespaldos: respaldosDir });
    assert.equal(estado.estado, ESTADO_CLAVE.EXISTING);

    // El inicializador recupera la clave existente, no la sobrescribe.
    const resultado = await inicializarClaveRespaldo({
      carpetaRespaldos: respaldosDir
    });
    assert.equal(resultado.estado, ESTADO_CLAVE.EXISTING);
    assert.deepStrictEqual(resultado.clave, claveHistorica);

    // El archivo de clave sigue siendo el mismo (no se sobrescribio).
    const archivoActual = fs.readFileSync(path.join(claveDir, 'backup-signing.key'));
    assert.deepStrictEqual(archivoActual, claveHistorica);
  });
});
