'use strict';

// Pruebas del orden de ejecución de backupService.crear() cuando la clave HMAC
// no está disponible (estado LOST, CORRUPT, UNDECRYPTABLE). La clave debe
// comprobarse ANTES de db.backup(), checkpoint o cualquier operación que cree
// o modifique archivos.
const { test, describe, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');

const backupService = require('../../backend/services/backupService');
const { verificarClaveDisponible } = backupService;
const {
  ESTADO_CLAVE,
  detectarEstadoClave,
  generarClaveNueva,
  setClaveManifiestoPath
} = require('../../backend/services/backupManifest');
const { closeDb, setTestDb, getDb } = require('../../backend/database/connection');
const Database = require('better-sqlite3');

// Electron simulado con safeStorage reversible, aislado por prueba.
const electronPrueba = {
  app: { getPath: () => 'test-user-data' },
  safeStorage: {
    isEncryptionAvailable: () => true,
    encryptString: (texto) => Buffer.from(texto, 'utf8').toString('base64'),
    decryptString: (cifrado) => {
      const texto = Buffer.from(String(cifrado), 'base64').toString('utf8');
      return texto;
    }
  }
};

// Electron simulado que falla al descifrar (UNDECRYPTABLE).
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
  return fs.mkdtempSync(path.join(os.tmpdir(), 'backup-orden-'));
}

function rutaClave(dir) {
  return path.join(dir, 'backup-signing.key');
}

function escribirClavePlana(ruta, bytes) {
  fs.writeFileSync(ruta, bytes);
}

function escribirRespaldoFalso(dir, nombre) {
  fs.writeFileSync(path.join(dir, nombre), Buffer.alloc(16));
}

function prepararDb(tempDir) {
  const dbPath = path.join(tempDir, 'farmacia.db');
  process.env.FARMACIA_TEST_DB_PATH = dbPath;
  closeDb();
  const db = new Database(dbPath);
  db.pragma('foreign_keys = ON');
  const { runMigrations } = require('../../backend/database/migrate');
  const { seed } = require('../../backend/database/seeds/seed');
  try {
    runMigrations(db);
    db.transaction(() => seed({ db, isTest: true }))();
  } finally {
    setTestDb(db);
  }
  return dbPath;
}

function sesionSuperadmin() {
  const authService = require('../../backend/services/authService');
  return authService.login('wilmer', 'Wilmer465*');
}

function contarArchivosDb(dir) {
  if (!fs.existsSync(dir)) return 0;
  return fs.readdirSync(dir).filter((n) => n.endsWith('.db')).length;
}

function contarManifestos(dir) {
  if (!fs.existsSync(dir)) return 0;
  return fs.readdirSync(dir).filter((n) => n.endsWith('.manifest.json')).length;
}

function contarFilasTabla(tabla) {
  const db = getDb();
  const row = db.prepare(`SELECT COUNT(*) AS c FROM ${tabla}`).get();
  return row.c;
}

describe('AC-4.2-03 — orden de ejecución de crear() sin clave disponible', () => {
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

  test('estado LOST: crear() se rechaza, no crea .db, no crea manifiesto, respaldos previos intactos, BD activa sin modificar', async () => {
    const dir = dirTemporal();
    dirs.push(dir);
    await prepararDb(dir);
    const respaldosDir = path.join(dir, 'backups');
    const claveDir = path.join(dir, 'clave');
    fs.mkdirSync(respaldosDir, { recursive: true });
    fs.mkdirSync(claveDir, { recursive: true });

    // Respaldo previo sin clave: evidencia de datos existentes => LOST.
    escribirRespaldoFalso(respaldosDir, 'farmacia_backup_previo_20260101_000000.db');

    backupService.setDirectorioRespaldos(respaldosDir);
    backupService.setClaveManifiestoPath(rutaClave(claveDir));

    const estado = detectarEstadoClave({ carpetaRespaldos: respaldosDir });
    assert.equal(estado.estado, ESTADO_CLAVE.LOST);

    const archivosDbAntes = contarArchivosDb(respaldosDir);
    const manifestosAntes = contarManifestos(respaldosDir);
    const filasSedesAntes = contarFilasTabla('sedes');
    const archivoPrevio = path.join(respaldosDir, 'farmacia_backup_previo_20260101_000000.db');
    const contenidoPrevioAntes = fs.readFileSync(archivoPrevio);

    const sesion = sesionSuperadmin();
    await assert.rejects(
      () => backupService.crear(sesion, {}),
      /clave de firma no está disponible/
    );

    // No aparece .db nuevo
    assert.equal(contarArchivosDb(respaldosDir), archivosDbAntes);
    // No aparece manifiesto nuevo
    assert.equal(contarManifestos(respaldosDir), manifestosAntes);
    // Respaldo previo intacto
    assert.deepStrictEqual(fs.readFileSync(archivoPrevio), contenidoPrevioAntes);
    // Base de datos activa sin modificar
    assert.equal(contarFilasTabla('sedes'), filasSedesAntes);
  });

  test('estado CORRUPT: crear() se rechaza, no toca archivos', async () => {
    const dir = dirTemporal();
    dirs.push(dir);
    await prepararDb(dir);
    const respaldosDir = path.join(dir, 'backups');
    const claveDir = path.join(dir, 'clave');
    fs.mkdirSync(respaldosDir, { recursive: true });
    fs.mkdirSync(claveDir, { recursive: true });

    // Clave corrupta: archivo existe pero no tiene 32 bytes.
    escribirClavePlana(rutaClave(claveDir), Buffer.from('clave-corta'));

    backupService.setDirectorioRespaldos(respaldosDir);
    backupService.setClaveManifiestoPath(rutaClave(claveDir));

    const archivosDbAntes = contarArchivosDb(respaldosDir);
    const manifestosAntes = contarManifestos(respaldosDir);
    const filasSedesAntes = contarFilasTabla('sedes');

    const sesion = sesionSuperadmin();
    await assert.rejects(
      () => backupService.crear(sesion, {}),
      /clave de firma no está disponible/
    );

    assert.equal(contarArchivosDb(respaldosDir), archivosDbAntes);
    assert.equal(contarManifestos(respaldosDir), manifestosAntes);
    assert.equal(contarFilasTabla('sedes'), filasSedesAntes);
  });

  test('estado UNDECRYPTABLE: crear() se rechaza antes de cualquier operación de archivos', async () => {
    const dir = dirTemporal();
    dirs.push(dir);
    await prepararDb(dir);
    const respaldosDir = path.join(dir, 'backups');
    const claveDir = path.join(dir, 'clave');
    fs.mkdirSync(respaldosDir, { recursive: true });
    fs.mkdirSync(claveDir, { recursive: true });

    // Archivo de clave existe pero no se puede descifrar con safeStorage.
    escribirClavePlana(rutaClave(claveDir), Buffer.from('enc:contenido-no-descifrable', 'utf8'));

    backupService.setDirectorioRespaldos(respaldosDir);
    backupService.setClaveManifiestoPath(rutaClave(claveDir));

    const archivosDbAntes = contarArchivosDb(respaldosDir);
    const manifestosAntes = contarManifestos(respaldosDir);
    const filasSedesAntes = contarFilasTabla('sedes');

    const sesion = sesionSuperadmin();
    // Se invoca crear() directamente con electron inyectado que falla al
    // descifrar. La clave se comprueba ANTES de db.backup() y checkpoint.
    await assert.rejects(
      () => backupService.crear(sesion, { electron: electronNoDescifra }),
      /clave de firma no está disponible/
    );

    // No aparece .db nuevo
    assert.equal(contarArchivosDb(respaldosDir), archivosDbAntes);
    // No aparece manifiesto nuevo
    assert.equal(contarManifestos(respaldosDir), manifestosAntes);
    // Base de datos activa sin modificar
    assert.equal(contarFilasTabla('sedes'), filasSedesAntes);
  });

  test('clave disponible: crear() funciona y genera .db + manifiesto', async () => {
    const dir = dirTemporal();
    dirs.push(dir);
    await prepararDb(dir);
    const respaldosDir = path.join(dir, 'backups');
    const claveDir = path.join(dir, 'clave');
    fs.mkdirSync(respaldosDir, { recursive: true });
    fs.mkdirSync(claveDir, { recursive: true });

    // Clave en texto plano (32 bytes) con override de ruta: se lee tal cual.
    const clave = crypto.randomBytes(32);
    escribirClavePlana(rutaClave(claveDir), clave);

    backupService.setDirectorioRespaldos(respaldosDir);
    backupService.setClaveManifiestoPath(rutaClave(claveDir));

    const archivosDbAntes = contarArchivosDb(respaldosDir);
    const manifestosAntes = contarManifestos(respaldosDir);

    const sesion = sesionSuperadmin();
    const creado = await backupService.crear(sesion, { electron: electronPrueba });
    assert.ok(creado.nombre);
    assert.ok(creado.firma);

    // Aparece .db nuevo
    assert.equal(contarArchivosDb(respaldosDir), archivosDbAntes + 1);
    // Aparece manifiesto nuevo
    assert.equal(contarManifestos(respaldosDir), manifestosAntes + 1);
    // El .db generado existe
    assert.ok(fs.existsSync(path.join(respaldosDir, creado.nombre)));
  });
});
