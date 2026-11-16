'use strict';

// Pruebas de la corrección V-4.2-01: una restauración solo puede aceptar una
// copia auténtica (manifiesto HMAC), íntegra y compatible con el esquema.
//
// Toda la SQLite de estas pruebas vive en %TEMP%. Nunca se abre ni se
// sustituye data/farmacia.db y la clave de firma queda fuera de backups/.
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const Database = require('better-sqlite3');

const { closeDb, getDb } = require('../../backend/database/connection');
const { runMigrations } = require('../../backend/database/migrate');
const { seed } = require('../../backend/database/seeds/seed');
const {
  restoreDatabase,
  sha256File
} = require('../../backend/database/startupRecovery');
const backupService = require('../../backend/services/backupService');
const backupManifest = require('../../backend/services/backupManifest');
const authService = require('../../backend/services/authService');
const { registerIpcHandlers } = require('../../backend/ipcHandlers');
const { ROLES } = require('../../shared/constants');

const NOMBRE_AJENO = 'farmacia_backup_global_20260101_000000.db';
const NOMBRE_LEGACY = 'farmacia_backup_global_20250101_000000.db';

function crearEntorno(t, prefijo = 'restore-seguridad') {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), `${prefijo}-`));
  const dbPath = path.join(dir, 'farmacia.db');
  const respaldosDir = path.join(dir, 'backups');
  const claveDir = path.join(dir, 'clave');
  const envPrevio = {
    NODE_ENV: process.env.NODE_ENV,
    FARMACIA_TEST_DB_PATH: process.env.FARMACIA_TEST_DB_PATH
  };

  process.env.NODE_ENV = 'test';
  process.env.FARMACIA_TEST_DB_PATH = dbPath;
  closeDb();

  const db = new Database(dbPath);
  try {
    runMigrations(db);
    seed({ db, isTest: true });
  } finally {
    db.close();
  }

  fs.mkdirSync(claveDir, { recursive: true });
  backupService.setDirectorioRespaldos(respaldosDir);
  backupService.setClaveManifiestoPath(path.join(claveDir, 'backup-signing.key'));

  t.after(() => {
    backupService.setDirectorioRespaldos(null);
    backupService.setClaveManifiestoPath(null);
    closeDb();
    if (envPrevio.NODE_ENV === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = envPrevio.NODE_ENV;
    if (envPrevio.FARMACIA_TEST_DB_PATH === undefined) delete process.env.FARMACIA_TEST_DB_PATH;
    else process.env.FARMACIA_TEST_DB_PATH = envPrevio.FARMACIA_TEST_DB_PATH;
    fs.rmSync(dir, { recursive: true, force: true });
  });

  return { dir, dbPath, respaldosDir };
}

function sesionAdmin(db) {
  const usuario = db.prepare("SELECT id FROM usuarios WHERE LOWER(username) = 'wilmer'").get();
  return {
    id: usuario.id,
    rol_nombre: ROLES.ADMIN,
    sede_id: 1,
    sede_nombre: 'Sede Principal'
  };
}

function crearSqliteAjena(ruta) {
  const db = new Database(ruta);
  try {
    db.exec(`
      CREATE TABLE marcador_ajeno (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        valor TEXT NOT NULL
      );
      INSERT INTO marcador_ajeno (valor) VALUES ('archivo ajeno');
    `);
  } finally {
    db.close();
  }
}

function serializarCanonico(valor) {
  if (Array.isArray(valor)) return `[${valor.map(serializarCanonico).join(',')}]`;
  if (valor && typeof valor === 'object') {
    const claves = Object.keys(valor).sort();
    return `{${claves.map((clave) => `${JSON.stringify(clave)}:${serializarCanonico(valor[clave])}`).join(',')}}`;
  }
  return JSON.stringify(valor);
}

function refirmarManifiesto(manifiesto, clave) {
  const { hmac: _omitido, ...payload } = manifiesto;
  return crypto.createHmac('sha256', clave).update(serializarCanonico(payload)).digest('hex');
}

async function marcarBaseActiva(texto) {
  const db = getDb();
  db.prepare("INSERT INTO sedes (nombre, ciudad, estado) VALUES (?, 'Test', 'ACTIVO')").run(texto);
}

function contarSede(texto) {
  const db = getDb();
  return db.prepare('SELECT COUNT(*) AS total FROM sedes WHERE nombre = ?').get(texto).total;
}

function contarTabla(nombre) {
  const db = getDb();
  return db.prepare("SELECT COUNT(*) AS total FROM sqlite_master WHERE type='table' AND name = ?").get(nombre).total;
}

function checkpointActiva() {
  getDb().pragma('wal_checkpoint(TRUNCATE)');
}

function ultimaAuditoria(accion, resultado) {
  const db = getDb();
  return db.prepare(`
    SELECT * FROM auditoria
    WHERE accion = ? AND modulo = 'RESPALDOS' AND resultado = ?
    ORDER BY id DESC LIMIT 1
  `).get(accion, resultado);
}

function eventoValido(rendererIndexPath) {
  const mainFrame = { id: 'frame-principal' };
  return {
    sender: { getURL: () => pathToFileURL(rendererIndexPath).href, mainFrame },
    senderFrame: mainFrame
  };
}

describe('V-4.2-01 — restauración de respaldos autenticados', () => {
  test('un respaldo creado por la app se restaura y deja copia previa, auditoría y datos del respaldo', async (t) => {
    const entorno = crearEntorno(t);
    const sesion = authService.login('wilmer', 'Wilmer465*');

    const creado = await backupService.crear(sesion, {});
    assert.equal(creado.restaurable, true);
    assert.ok(fs.existsSync(path.join(entorno.respaldosDir, creado.nombre)));
    assert.ok(fs.existsSync(backupManifest.rutaManifiesto(path.join(entorno.respaldosDir, creado.nombre))));

    await marcarBaseActiva('Sede Posterior Al Respaldo');
    assert.equal(contarSede('Sede Posterior Al Respaldo'), 1);

    // La copia previa se compara contra el archivo ya checkpointado, que es el
    // mismo estado que restoreDatabase fija como original.
    checkpointActiva();
    const hashOriginal = await sha256File(entorno.dbPath);

    const resultado = await backupService.restaurar(sesion, creado.nombre);
    assert.equal(resultado.restaurado, true);
    assert.equal(resultado.nombre, creado.nombre);

    // El marcador posterior al respaldo desaparece: se restauró el contenido.
    assert.equal(contarSede('Sede Posterior Al Respaldo'), 0);
    assert.ok(getDb().prepare('SELECT COUNT(*) AS total FROM usuarios').get().total > 0);

    // La copia previa a la sustitución se conserva con el hash exacto.
    const copiaPrevia = fs.readdirSync(entorno.dir).find((nombre) => nombre.endsWith('.promoted-old.db'));
    assert.ok(copiaPrevia, 'debe conservarse la base anterior');
    assert.equal(await sha256File(path.join(entorno.dir, copiaPrevia)), hashOriginal);

    // La auditoría de éxito viaja dentro de la base restaurada.
    const auditoria = ultimaAuditoria('RESTAURAR_RESPALDO', 'EXITO');
    assert.ok(auditoria);
    assert.equal(auditoria.registro_afectado, creado.nombre);
    assert.equal(auditoria.usuario_id, sesion.id);

    const listado = await backupService.listar(sesion, {});
    assert.equal(listado.find((b) => b.nombre === creado.nombre).restaurable, true);
  });

  test('un rol sin acceso no restaura y el intento queda auditado', async (t) => {
    crearEntorno(t);
    const sesion = authService.login('wilmer', 'Wilmer465*');
    const usuario = { ...sesion, rol_nombre: ROLES.USUARIO, sede_id: 1 };

    await assert.rejects(
      () => backupService.restaurar(usuario, NOMBRE_AJENO),
      /Solo el Superadmin y el Administrador de sede/i
    );

    const auditoria = ultimaAuditoria('RESTAURAR_RESPALDO', 'FALLIDO');
    assert.ok(auditoria);
    assert.equal(auditoria.rol, ROLES.USUARIO);
    assert.match(auditoria.valores_nuevos, /SIN_PERMISO/);
  });

  test('rechaza una SQLite ajena sin manifiesto y conserva intacta la base activa', async (t) => {
    const entorno = crearEntorno(t);
    const sesion = authService.login('wilmer', 'Wilmer465*');
    fs.mkdirSync(entorno.respaldosDir, { recursive: true });
    crearSqliteAjena(path.join(entorno.respaldosDir, NOMBRE_AJENO));

    await marcarBaseActiva('Sede Activa Original');

    await assert.rejects(
      () => backupService.restaurar(sesion, NOMBRE_AJENO),
      /manifiesto de autenticidad/i
    );

    assert.equal(contarSede('Sede Activa Original'), 1);
    assert.equal(contarTabla('marcador_ajeno'), 0);

    const auditoria = ultimaAuditoria('RESTAURAR_RESPALDO', 'FALLIDO');
    assert.ok(auditoria);
    assert.equal(auditoria.registro_afectado, NOMBRE_AJENO);

    // Un ADMIN no ve archivos sin manifiesto autenticado: el nombre no acredita
    // que el respaldo pertenezca a su sede.
    const listadoAdmin = await backupService.listar(sesionAdmin(getDb()), {});
    assert.equal(listadoAdmin.some((b) => b.nombre === NOMBRE_AJENO), false);
  });

  test('rechaza un respaldo auténtico cuyo contenido fue corrompido', async (t) => {
    const entorno = crearEntorno(t);
    const sesion = authService.login('wilmer', 'Wilmer465*');
    const creado = await backupService.crear(sesion, {});
    fs.writeFileSync(path.join(entorno.respaldosDir, creado.nombre), Buffer.from('no es sqlite'));

    await marcarBaseActiva('Sede Activa Ante Corrupto');

    await assert.rejects(
      () => backupService.restaurar(sesion, creado.nombre),
      /no coincide con su registro de autenticidad|no es una base de datos/i
    );

    assert.equal(contarSede('Sede Activa Ante Corrupto'), 1);
    assert.equal(contarTabla('marcador_ajeno'), 0);
    assert.ok(ultimaAuditoria('RESTAURAR_RESPALDO', 'FALLIDO'));
  });

  test('rechaza un manifiesto firmado que declara un esquema incompatible', async (t) => {
    const entorno = crearEntorno(t);
    const sesion = authService.login('wilmer', 'Wilmer465*');
    const creado = await backupService.crear(sesion, {});
    const rutaDb = path.join(entorno.respaldosDir, creado.nombre);
    const rutaManifiesto = backupManifest.rutaManifiesto(rutaDb);

    const manifiesto = JSON.parse(fs.readFileSync(rutaManifiesto, 'utf8'));
    manifiesto.esquema.migraciones = manifiesto.esquema.migraciones.slice(0, -1);
    manifiesto.hmac = refirmarManifiesto(manifiesto, backupManifest.obtenerClave());
    fs.writeFileSync(rutaManifiesto, `${JSON.stringify(manifiesto)}\n`);

    await marcarBaseActiva('Sede Activa Ante Esquema');

    await assert.rejects(
      () => backupService.restaurar(sesion, creado.nombre),
      /compatible con el esquema/i
    );

    assert.equal(contarSede('Sede Activa Ante Esquema'), 1);
    assert.equal(contarTabla('marcador_ajeno'), 0);
  });

  test('un ADMIN solo restaura respaldos de su sede; el global sigue bloqueado', async (t) => {
    crearEntorno(t);
    const superadmin = authService.login('wilmer', 'Wilmer465*');
    const admin = sesionAdmin(getDb());

    const global = await backupService.crear(superadmin, {});
    await assert.rejects(
      () => backupService.restaurar(admin, global.nombre),
      /Solo puede restaurar respaldos de su propia sede/i
    );

    const deSede = await backupService.crear(admin, {});
    const listado = await backupService.listar(admin, {});
    assert.ok(listado.some((b) => b.nombre === deSede.nombre && b.sedeId === 1 && b.restaurable));

    const resultado = await backupService.restaurar(admin, deSede.nombre);
    assert.equal(resultado.restaurado, true);
    assert.equal(ultimaAuditoria('RESTAURAR_RESPALDO', 'EXITO').sede_id, 1);
  });

  test('si el manifiesto no se puede firmar, el respaldo se descarta', async (t) => {
    const entorno = crearEntorno(t);
    const sesion = authService.login('wilmer', 'Wilmer465*');
    // Convertir la ruta de la clave en un directorio hace fallar la firma.
    const rutaClave = path.join(entorno.dir, 'clave', 'backup-signing.key');
    fs.rmSync(rutaClave, { force: true });
    fs.mkdirSync(rutaClave);

    await assert.rejects(
      () => backupService.crear(sesion, {}),
      /firmar el respaldo|autenticidad/i
    );

    const archivosDb = fs.existsSync(entorno.respaldosDir)
      ? fs.readdirSync(entorno.respaldosDir).filter((nombre) => nombre.endsWith('.db'))
      : [];
    assert.deepEqual(archivosDb, [], 'no debe quedar un .db sin manifiesto válido');
  });

  test('un respaldo legacy sin manifiesto se muestra no restaurable para SUPERADMIN', async (t) => {
    const entorno = crearEntorno(t);
    const sesion = authService.login('wilmer', 'Wilmer465*');
    fs.mkdirSync(entorno.respaldosDir, { recursive: true });
    crearSqliteAjena(path.join(entorno.respaldosDir, NOMBRE_LEGACY));

    const listado = await backupService.listar(sesion, {});
    const legacy = listado.find((b) => b.nombre === NOMBRE_LEGACY);
    assert.ok(legacy);
    assert.equal(legacy.restaurable, false);
    assert.match(legacy.motivoNoRestaurable, /manifiesto/i);
  });
});

describe('V-4.2-01 — recuperación y copia previa en startupRecovery', () => {
  function crearFixture(t) {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'restore-promote-'));
    t.after(() => {
      closeDb();
      fs.rmSync(dir, { recursive: true, force: true });
    });
    const dbPath = path.join(dir, 'active.db');
    const backupPath = path.join(dir, 'selected-backup.db');
    const activa = new Database(dbPath);
    activa.exec("CREATE TABLE fixture (value TEXT NOT NULL); INSERT INTO fixture VALUES ('original');");
    activa.close();
    const respaldo = new Database(backupPath);
    respaldo.exec("CREATE TABLE fixture (value TEXT NOT NULL); INSERT INTO fixture VALUES ('restored');");
    respaldo.close();
    return { dir, dbPath, backupPath };
  }

  test('un fallo de beforePromote (auditoría) no sustituye la base activa', async (t) => {
    const { dbPath, backupPath } = crearFixture(t);
    const hashOriginal = await sha256File(dbPath);
    const activeDb = new Database(dbPath);

    await assert.rejects(
      () => restoreDatabase({
        databasePath: dbPath,
        sourceBackupPath: backupPath,
        activeDb,
        closeActiveDb: () => activeDb.close(),
        beforePromote: () => { throw new Error('falló la auditoría previa'); }
      }),
      /auditoría previa/
    );

    assert.equal(await sha256File(dbPath), hashOriginal);
    const comprobacion = new Database(dbPath, { readonly: true });
    try {
      assert.equal(comprobacion.prepare('SELECT value FROM fixture').get().value, 'original');
    } finally {
      comprobacion.close();
    }
  });

  test('un fallo después de promover ejecuta el rollback con la copia exacta', async (t) => {
    const { dir, dbPath, backupPath } = crearFixture(t);
    const hashOriginal = await sha256File(dbPath);
    const activeDb = new Database(dbPath);
    let sustituciones = 0;
    let fallar = true;

    // El primer promote simula un fallo del reemplazo de archivo. El segundo
    // (el del rollback) debe ejecutarse de verdad para comprobar que la base
    // anterior queda restaurada, no solo que se intentó.
    const promoteQueFalla = (rutaActiva, rutaReemplazo, rutaCopia) => {
      sustituciones += 1;
      fs.renameSync(rutaActiva, rutaCopia);
      fs.renameSync(rutaReemplazo, rutaActiva);
      if (fallar) {
        fallar = false;
        throw new Error('fallo de sustitución simulado');
      }
    };

    await assert.rejects(
      () => restoreDatabase({
        databasePath: dbPath,
        sourceBackupPath: backupPath,
        activeDb,
        closeActiveDb: () => activeDb.close(),
        promote: promoteQueFalla
      }),
      /fallo de sustitución simulado/
    );

    assert.equal(sustituciones, 2, 'el rollback debe promover la copia original');
    assert.equal(await sha256File(dbPath), hashOriginal);
    const comprobacion = new Database(dbPath, { readonly: true });
    try {
      assert.equal(comprobacion.prepare('SELECT value FROM fixture').get().value, 'original');
    } finally {
      comprobacion.close();
    }
    const copia = fs.readdirSync(dir).find((nombre) => nombre.endsWith('.promoted-old.db'));
    assert.ok(copia);
    assert.equal(await sha256File(path.join(dir, copia)), hashOriginal);
  });
});

describe('V-4.2-02 — reinicio solo después de una restauración exitosa', () => {
  const rendererIndexPath = path.join(__dirname, '..', '..', 'dist', 'renderer', 'index.html');

  function registrarConApp() {
    const handlers = new Map();
    const ipcMain = { handle: (nombre, handler) => handlers.set(nombre, handler) };
    const llamadas = { relaunch: 0, exit: 0 };
    const app = {
      relaunch: () => { llamadas.relaunch += 1; },
      exit: () => { llamadas.exit += 1; },
      getPath: () => os.tmpdir()
    };
    registerIpcHandlers({
      ipcMain,
      app,
      shell: {},
      dialog: {},
      BrowserWindow: {},
      isDev: false,
      rendererIndexPath,
      logger: { warn: () => {}, error: () => {}, log: () => {} }
    });
    return { handler: handlers.get('backups:restaurar'), llamadas };
  }

  const esperarReinicio = () => new Promise((resolve) => setTimeout(resolve, 450));

  test('espera la promesa real y reinicia cuando la restauración responde ok', async (t) => {
    crearEntorno(t, 'restore-reinicio');
    const sesion = authService.login('wilmer', 'Wilmer465*');
    const creado = await backupService.crear(sesion, {});
    const { handler, llamadas } = registrarConApp();
    const evento = eventoValido(rendererIndexPath);

    const respuesta = await handler(evento, sesion, creado.nombre);
    assert.equal(respuesta.ok, true, JSON.stringify(respuesta));
    await esperarReinicio();

    assert.equal(llamadas.relaunch, 1);
    assert.equal(llamadas.exit, 1);
  });

  test('no reinicia cuando la validación rechaza el respaldo', async (t) => {
    const entorno = crearEntorno(t, 'restore-sin-reinicio');
    const sesion = authService.login('wilmer', 'Wilmer465*');
    fs.mkdirSync(entorno.respaldosDir, { recursive: true });
    crearSqliteAjena(path.join(entorno.respaldosDir, NOMBRE_AJENO));
    await marcarBaseActiva('Sede Activa Sin Reinicio');
    const { handler, llamadas } = registrarConApp();
    const evento = eventoValido(rendererIndexPath);

    const respuesta = await handler(evento, sesion, NOMBRE_AJENO);
    assert.equal(respuesta.ok, false);
    assert.match(respuesta.error, /manifiesto de autenticidad/i);
    await esperarReinicio();

    assert.equal(llamadas.relaunch, 0);
    assert.equal(llamadas.exit, 0);
    assert.equal(contarSede('Sede Activa Sin Reinicio'), 1);
    assert.equal(contarTabla('marcador_ajeno'), 0);
  });
});
