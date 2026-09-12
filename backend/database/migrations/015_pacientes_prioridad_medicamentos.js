// Migracion 015: documentacion ampliada de pacientes/receptores
module.exports = {
  name: '015_pacientes_prioridad_medicamentos',
  up(db) {
    const cols = db.prepare("PRAGMA table_info(receptores)").all().map(c => c.name);

    if (!cols.includes('prioridad')) {
      db.exec("ALTER TABLE receptores ADD COLUMN prioridad TEXT NOT NULL DEFAULT 'MEDIA';");
    }

    if (!cols.includes('medicamentos_uso')) {
      db.exec("ALTER TABLE receptores ADD COLUMN medicamentos_uso TEXT;");
    }

    if (!cols.includes('notas')) {
      db.exec("ALTER TABLE receptores ADD COLUMN notas TEXT;");
    }

    db.exec("CREATE INDEX IF NOT EXISTS idx_receptores_prioridad ON receptores(prioridad);");
  }
};
