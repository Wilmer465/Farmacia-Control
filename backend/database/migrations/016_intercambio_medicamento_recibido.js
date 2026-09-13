// Migracion 016: datos del medicamento recibido en solicitudes de intercambio.
module.exports = {
  name: '016_intercambio_medicamento_recibido',
  up(db) {
    const cols = db.prepare("PRAGMA table_info(solicitudes_intercambio)").all().map(c => c.name);
    if (!cols.includes('sede_recibe_id')) {
      db.exec("ALTER TABLE solicitudes_intercambio ADD COLUMN sede_recibe_id INTEGER;");
    }
    if (!cols.includes('lote_recibe_id')) {
      db.exec("ALTER TABLE solicitudes_intercambio ADD COLUMN lote_recibe_id INTEGER;");
    }
    if (!cols.includes('medicamento_recibe_id')) {
      db.exec("ALTER TABLE solicitudes_intercambio ADD COLUMN medicamento_recibe_id INTEGER;");
    }
    if (!cols.includes('cantidad_recibe_total_unidades')) {
      db.exec("ALTER TABLE solicitudes_intercambio ADD COLUMN cantidad_recibe_total_unidades INTEGER;");
    }
    db.exec("CREATE INDEX IF NOT EXISTS idx_sol_intercambio_lote_recibe ON solicitudes_intercambio(lote_recibe_id);");
  }
};
