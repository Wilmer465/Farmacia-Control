// Migración 010: Receptores con guardado de firmas/huellas y documentos adjuntos de identidad
module.exports = {
  name: '010_receptores_y_documentos',
  up(db) {
    db.exec(`
      CREATE TABLE IF NOT EXISTS receptores (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        documento TEXT NOT NULL UNIQUE,
        nombre TEXT NOT NULL,
        telefono TEXT,
        firma_guardada TEXT,
        huella_guardada INTEGER NOT NULL DEFAULT 0,
        documento_adjunto_nombre TEXT,
        documento_adjunto_data TEXT,
        documento_adjunto_tipo TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now'))
      );

      CREATE INDEX IF NOT EXISTS idx_receptores_documento ON receptores(documento);
      CREATE INDEX IF NOT EXISTS idx_receptores_nombre ON receptores(nombre);
    `);

    // Añadir columnas para documentos adjuntos a entregas si no existen
    const cols = db.prepare("PRAGMA table_info(entregas)").all().map(c => c.name);
    if (!cols.includes('documento_adjunto_nombre')) {
      db.exec(`ALTER TABLE entregas ADD COLUMN documento_adjunto_nombre TEXT;`);
    }
    if (!cols.includes('documento_adjunto_data')) {
      db.exec(`ALTER TABLE entregas ADD COLUMN documento_adjunto_data TEXT;`);
    }
    if (!cols.includes('documento_adjunto_tipo')) {
      db.exec(`ALTER TABLE entregas ADD COLUMN documento_adjunto_tipo TEXT;`);
    }
  }
};
