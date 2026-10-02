const fs = require('fs');
const path = require('path');
const { getDb } = require('./connection');

function ensureMigrationsTable(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS migrations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      nombre TEXT NOT NULL UNIQUE,
      ejecutado_en TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `);
}

// Migración atómica por defecto: `up()` y el registro en `migrations` se aplican
// juntos o no se aplica ninguno.
//
// Excepción declarada con `atomic: false`: hay sentencias que SQLite no acepta
// dentro de una transacción —`VACUUM` entre ellas—, y una migración de ese tipo
// solo puede correr sin el envoltorio. Quien marque `atomic: false` asume que la
// operación NO es reversible por el runner; por eso esas migraciones son las
// últimas de su bloque y todas las suyas se emiten en orden lexicográfico
// (`024_`, `025_`, `026_`...).
function ejecutarMigracion(db, migration, insertRecord) {
  if (migration.atomic === false) {
    migration.up(db);
    insertRecord.run(migration.name);
    return;
  }
  db.transaction(() => {
    migration.up(db);
    insertRecord.run(migration.name);
  })();
}

function runMigrations() {
  const db = getDb();
  ensureMigrationsTable(db);

  const dir = path.join(__dirname, 'migrations');
  const files = fs.readdirSync(dir)
    .filter(f => f.endsWith('.js'))
    .sort(); // 001_, 002_, ... garantiza orden

  const already = new Set(
    db.prepare('SELECT nombre FROM migrations').all().map(r => r.nombre)
  );

  const insertRecord = db.prepare('INSERT INTO migrations (nombre) VALUES (?)');

  for (const file of files) {
    const migration = require(path.join(dir, file));
    if (already.has(migration.name)) continue;

    try {
      ejecutarMigracion(db, migration, insertRecord);
      const sufijo = migration.atomic === false ? ' (no atómica)' : '';
      console.log(`[migrate] OK  -> ${migration.name}${sufijo}`);
    } catch (err) {
      console.error(`[migrate] FALLÓ -> ${migration.name}:`, err.message);
      throw err;
    }
  }

  console.log('[migrate] Migraciones al día.');
}

if (require.main === module) {
  runMigrations();
}

module.exports = { runMigrations };
