// Migración 028: columna updated_at en usuarios para el delta-sync.
// Sin ella, `getRowsToSync` solo veía `created_at` y los cambios de rol,
// estado o sede jamás subían en modo incremental (pérdida silenciosa).
module.exports = {
  name: '028_usuarios_updated_at',
  up(db) {
    const cols = db.prepare('PRAGMA table_info(usuarios)').all().map((c) => c.name);
    if (!cols.includes('updated_at')) {
      db.exec(`ALTER TABLE usuarios ADD COLUMN updated_at TEXT NOT NULL DEFAULT (datetime('now'));`);
    }
    db.exec(`
      CREATE TRIGGER IF NOT EXISTS trg_usuarios_updated_at
      AFTER UPDATE ON usuarios
      FOR EACH ROW
      WHEN NEW.updated_at IS OLD.updated_at
      BEGIN
        UPDATE usuarios SET updated_at = datetime('now') WHERE id = NEW.id;
      END;
    `);
  },
  down(db) {
    db.exec(`DROP TRIGGER IF EXISTS trg_usuarios_updated_at;`);
  }
};
