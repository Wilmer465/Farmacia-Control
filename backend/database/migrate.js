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

    const runTx = db.transaction(() => {
      migration.up(db);
      insertRecord.run(migration.name);
    });

    try {
      runTx();
      console.log(`[migrate] OK  -> ${migration.name}`);
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
