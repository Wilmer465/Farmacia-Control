// Migración 022: Adjuntar documentos/archivos a registros del catálogo CUM
module.exports = {
  name: '022_catalogo_cum_documentos',
  up(db) {
    const cols = db.prepare("PRAGMA table_info(catalogo_cum)").all().map(r => r.name);

    if (!cols.includes('documento_adjunto_nombre')) {
      db.exec("ALTER TABLE catalogo_cum ADD COLUMN documento_adjunto_nombre TEXT;");
    }
    if (!cols.includes('documento_adjunto_data')) {
      db.exec("ALTER TABLE catalogo_cum ADD COLUMN documento_adjunto_data TEXT;");
    }
    if (!cols.includes('documento_adjunto_tipo')) {
      db.exec("ALTER TABLE catalogo_cum ADD COLUMN documento_adjunto_tipo TEXT;");
    }
  },
  down(db) {
    db.exec("ALTER TABLE catalogo_cum DROP COLUMN documento_adjunto_tipo;");
    db.exec("ALTER TABLE catalogo_cum DROP COLUMN documento_adjunto_data;");
    db.exec("ALTER TABLE catalogo_cum DROP COLUMN documento_adjunto_nombre;");
  }
};
