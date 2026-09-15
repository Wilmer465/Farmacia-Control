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
  try {
    const { app } = require('electron');
    if (app && app.isPackaged) {
      const dir = app.getPath('userData');
      return path.join(dir, 'farmacia.db');
    }
  } catch (_) {
    // no estamos en el proceso principal de electron (ej: scripts de migrate/seed)
  }
  const dir = path.join(__dirname, '..', '..', 'data');
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  return path.join(dir, 'farmacia.db');
}

let dbInstance = null;

function getDb() {
  if (dbInstance) return dbInstance;

  const dbPath = resolveDbPath();
  dbInstance = new Database(dbPath);
  dbInstance.pragma('journal_mode = WAL');
  dbInstance.pragma('synchronous = NORMAL');
  dbInstance.pragma('cache_size = -64000'); // 64 MB de caché en RAM
  dbInstance.pragma('temp_store = MEMORY'); // Tablas temporales en RAM
  dbInstance.pragma('mmap_size = 268435456'); // 256 MB memory-mapped I/O
  dbInstance.pragma('foreign_keys = ON');
  dbInstance.pragma('busy_timeout = 5000');
  // Mantenimiento: auto_vacuum incremental para que el archivo no crezca sin
  // control con los blobs; el vacuum real se hace al cerrar (ver main.js).
  try { dbInstance.pragma('auto_vacuum = INCREMENTAL'); } catch (_) {}
  try { dbInstance.pragma('optimize'); } catch (_) {}
  return dbInstance;
}

function mantenimientoAlCerrar() {
  if (!dbInstance) return;
  try { dbInstance.pragma('optimize'); } catch (_) {}
  try { dbInstance.pragma('incremental_vacuum(100)'); } catch (_) {}
  try { dbInstance.exec('ANALYZE'); } catch (_) {}
}

function closeDb() {
  if (dbInstance) {
    dbInstance.close();
    dbInstance = null;
  }
}

module.exports = { getDb, resolveDbPath, closeDb, mantenimientoAlCerrar };
