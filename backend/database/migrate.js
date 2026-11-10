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

function cargarMigraciones() {
  const dir = path.join(__dirname, 'migrations');
  const files = fs.readdirSync(dir)
    .filter(f => f.endsWith('.js'))
    .sort();
  const migrations = files.map((file) => ({ file, migration: require(path.join(dir, file)) }));
  const names = migrations.map(({ migration }) => migration.name);
  if (names.some((name) => typeof name !== 'string' || !name.trim()) || new Set(names).size !== names.length) {
    throw new Error('El registro de migraciones contiene nombres vacíos o duplicados.');
  }
  return migrations;
}

function obtenerEstadoMigraciones(db, migrations = cargarMigraciones()) {
  const existingTable = db.prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'migrations'").get();
  if (!existingTable) return { applied: [], pending: migrations.map(({ migration }) => migration.name) };
  const applied = db.prepare('SELECT nombre FROM migrations ORDER BY id').all().map((row) => row.nombre);
  const knownNames = new Set(migrations.map(({ migration }) => migration.name));
  const unknown = applied.filter((name) => !knownNames.has(name));
  if (unknown.length) throw new Error(`La base contiene migraciones no reconocidas por esta versión (${unknown.length}).`);
  const appliedSet = new Set(applied);
  let foundPending = false;
  for (const { migration } of migrations) {
    if (!appliedSet.has(migration.name)) foundPending = true;
    else if (foundPending) throw new Error('El registro de migraciones no forma una secuencia compatible.');
  }
  return { applied, pending: migrations.filter(({ migration }) => !appliedSet.has(migration.name)).map(({ migration }) => migration.name) };
}

function runMigrations(database = null, options = {}) {
  const db = database || getDb();
  ensureMigrationsTable(db);
  const migrations = cargarMigraciones();
  const { applied } = obtenerEstadoMigraciones(db, migrations);
  const already = new Set(applied);

  const insertRecord = db.prepare('INSERT INTO migrations (nombre) VALUES (?)');

  for (const { migration } of migrations) {
    if (already.has(migration.name)) continue;

    try {
      if (typeof options.beforeEach === 'function') {
        const remaining = migrations
          .map(({ migration: candidate }) => candidate)
          .filter((candidate) => !already.has(candidate.name))
          .map((candidate) => candidate.name);
        options.beforeEach({ db, migration, remaining });
      }
      ejecutarMigracion(db, migration, insertRecord);
      already.add(migration.name);
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

module.exports = { runMigrations, cargarMigraciones, obtenerEstadoMigraciones };
