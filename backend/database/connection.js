const path = require('path');
const fs = require('fs');
const Database = require('better-sqlite3');

// En proceso Electron (main), `app` existe y da la ruta de datos del usuario.
// En scripts standalone (migrate.js/seed.js ejecutados con `node`), no existe electron,
// así que caemos a una carpeta local ./data para poder correrlos fuera de Electron.
// En producción (app empaquetada), la BD vive en userData del sistema operativo.
// En desarrollo, usamos siempre ./data en la raíz del proyecto, para que el
// seed/migrate corridos con `node` y la app corrida con `electron .` apunten
// exactamente al mismo archivo. Si esto se hiciera distinto, el usuario podría
// sembrar datos en un lado y la app abrir una base de datos vacía en otro.
function resolveDbPath() {
  if (process.env.NODE_ENV === 'test' && process.env.FARMACIA_TEST_DB_PATH) {
    const rutaPrueba = path.resolve(process.env.FARMACIA_TEST_DB_PATH);
    const rutaDesarrollo = path.resolve(__dirname, '..', '..', 'data', 'farmacia.db');
    if (!path.isAbsolute(process.env.FARMACIA_TEST_DB_PATH) || rutaPrueba === rutaDesarrollo) {
      throw new Error('La ruta SQLite de prueba debe ser absoluta y distinta de la base de desarrollo.');
    }
    return rutaPrueba;
  }

  try {
    const { app } = require('electron');
    if (app && app.isPackaged) {
      const dir = app.getPath('userData');
      if (!dir) throw new Error('Electron no proporcionó una ruta userData válida.');
      return path.join(dir, 'farmacia.db');
    }
  } catch {
    if (process.versions.electron) {
      throw new Error('No se pudo resolver la ruta segura de datos de Electron.');
    }
    // No estamos en Electron (ej.: scripts standalone).
  }
  const dir = path.join(__dirname, '..', '..', 'data');
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  return path.join(dir, 'farmacia.db');
}

let dbInstance = null;
let databaseMaintenance = false;

function beginDatabaseMaintenance() {
  if (databaseMaintenance) throw new Error('La base de datos ya está en mantenimiento.');
  databaseMaintenance = true;
}

function endDatabaseMaintenance() {
  databaseMaintenance = false;
}

function getDb() {
  if (databaseMaintenance) throw new Error('La base de datos está en mantenimiento; no se aceptan operaciones nuevas.');
  if (dbInstance) return dbInstance;

  const dbPath = resolveDbPath();
  const db = new Database(dbPath);
  db.pragma('journal_mode = WAL');
  db.pragma('synchronous = NORMAL');
  db.pragma('cache_size = -64000'); // 64 MB de caché en RAM
  db.pragma('temp_store = MEMORY'); // Tablas temporales en RAM
  db.pragma('mmap_size = 268435456'); // 256 MB memory-mapped I/O
  db.pragma('foreign_keys = ON');
  db.pragma('busy_timeout = 5000');
  // Mantenimiento: auto_vacuum incremental para que el archivo no crezca sin
  // control con los blobs; el vacuum real se hace al cerrar (ver main.js).
  try { db.pragma('auto_vacuum = INCREMENTAL'); } catch {}
  try { db.pragma('optimize'); } catch {}
  dbInstance = db;
  return dbInstance;
}

function mantenimientoAlCerrar() {
  if (!dbInstance || databaseMaintenance) return;
  try { dbInstance.pragma('optimize'); } catch {}
  try { dbInstance.pragma('incremental_vacuum(100)'); } catch {}
  try { dbInstance.exec('ANALYZE'); } catch {}
}

function setTestDb(instance) {
  if (dbInstance && dbInstance !== instance) {
    try { dbInstance.close(); } catch {}
  }
  dbInstance = instance;
  if (dbInstance) {
    dbInstance.pragma('foreign_keys = ON');
  }
}

function closeDb() {
  if (dbInstance) {
    dbInstance.close();
    dbInstance = null;
  }
}

module.exports = {
  getDb,
  resolveDbPath,
  closeDb,
  mantenimientoAlCerrar,
  setTestDb,
  beginDatabaseMaintenance,
  endDatabaseMaintenance
};
