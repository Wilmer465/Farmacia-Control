const fs = require('fs');
const os = require('os');
const path = require('path');
const Database = require('better-sqlite3');
const { runMigrations } = require('../../backend/database/migrate');
const { seed } = require('../../backend/database/seeds/seed');
const database = require('../../backend/database/connection');
const catalogo = require('../../backend/services/catalogoCumService');

async function main() {
  const existingDbPath = process.env.FARMACIA_BENCH_EXISTING_DB;
  if (existingDbPath) {
    const db = new Database(existingDbPath);
    try {
      database.setTestDb(db);
      let importMs = null;
      let importStats = null;
      if (process.env.FARMACIA_BENCH_REFRESH === '1') {
        const started = performance.now();
        importStats = await catalogo.actualizarCatalogo({ id: 1, rol_nombre: 'SUPERADMIN', sede_id: null }, { forzar: true });
        importMs = Math.round(performance.now() - started);
        if (!importStats.ok) throw new Error(`Actualización INVIMA falló: ${JSON.stringify(importStats)}`);
      }
      const total = db.prepare('SELECT COUNT(*) AS n FROM catalogo_cum').get().n;
      const sample = db.prepare('SELECT cum FROM catalogo_cum ORDER BY cum LIMIT 1').get()?.cum;
      const syntheticGtin = '7702057700010';
      const timed = (fn, rounds) => {
        const start = performance.now();
        for (let i = 0; i < rounds; i += 1) fn();
        const elapsed = performance.now() - start;
        return { rondas: rounds, totalMs: Number(elapsed.toFixed(2)), promedioMs: Number((elapsed / rounds).toFixed(3)) };
      };
      const searchCum = timed(() => catalogo.buscarPorCUM(sample), 10);
      const searchGTIN = timed(() => catalogo.buscarPorGTIN(syntheticGtin), 10);
      const searchText = timed(() => catalogo.buscarPorProducto('acetaminofen', 20), 1);
      const bytes = fs.statSync(existingDbPath).size;
      console.log(JSON.stringify({ database: existingDbPath, filasFuenteImportadas: importStats?.descargados ?? null, duracionImportacionMs: importMs, cum: total, tamanoSQLiteBytes: bytes, tamanoSQLiteMiB: Number((bytes / 1024 / 1024).toFixed(2)), busquedaCUM: searchCum, busquedaGTIN: searchGTIN, busquedaTexto: searchText, notaGTIN: 'consulta de código sintético no presente; la fuente INVIMA no aporta GTIN' }));
    } finally {
      database.setTestDb(null);
      if (db.open) db.close();
    }
    return;
  }
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'farmacia-catalogo-bench-'));
  const dbPath = path.join(directory, 'catalogo.db');
  const db = new Database(dbPath);
  const usuario = { id: 1, rol_nombre: 'SUPERADMIN', sede_id: null };
  try {
    db.pragma('journal_mode = WAL');
    db.pragma('foreign_keys = ON');
    runMigrations(db);
    seed({ db, isTest: true });
    database.setTestDb(db);
    const started = performance.now();
    const imported = await catalogo.actualizarCatalogo(usuario, { forzar: true });
    const importMs = performance.now() - started;
    if (!imported.ok) throw new Error(`Importación INVIMA falló: ${JSON.stringify(imported)}`);

    const total = db.prepare('SELECT COUNT(*) AS n FROM catalogo_cum').get().n;
    const ids = db.prepare('SELECT cum FROM catalogo_cum ORDER BY cum LIMIT 100').all().map((row) => row.cum);
    const sample = ids[Math.min(10, ids.length - 1)];
    const timed = (fn, rounds = 100) => {
      const start = performance.now();
      for (let i = 0; i < rounds; i += 1) fn();
      return { rondas: rounds, totalMs: Number((performance.now() - start).toFixed(2)), promedioMs: Number(((performance.now() - start) / rounds).toFixed(3)) };
    };
    const searchCum = timed(() => catalogo.buscarPorCUM(sample));
    const searchText = timed(() => catalogo.buscarPorProducto('acetaminofen', 20), 5);
    db.pragma('wal_checkpoint(TRUNCATE)');
    const bytes = fs.statSync(dbPath).size;
    console.log(JSON.stringify({
      database: dbPath,
      filasFuente: imported.descargados,
      cumConsolidados: total,
      duracionImportacionMs: Math.round(importMs),
      tamanoSQLiteBytes: bytes,
      tamanoSQLiteMiB: Number((bytes / 1024 / 1024).toFixed(2)),
      busquedaCUM: searchCum,
      busquedaTexto: searchText,
      gtinDisponibles: db.prepare("SELECT COUNT(*) AS n FROM catalogo_cum WHERE gtin IS NOT NULL AND gtin <> ''").get().n
    }));
  } finally {
    database.setTestDb(null);
    if (db.open) db.close();
  }
}

main().catch((error) => {
  console.error(error.stack || error.message);
  process.exitCode = 1;
});
