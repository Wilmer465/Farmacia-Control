// Migración 036: trazabilidad del catálogo INVIMA y códigos desconocidos locales.
module.exports = {
  name: '036_catalogo_maestro_local',
  up(db) {
    const columnas = new Set(db.prepare('PRAGMA table_info(catalogo_cum)').all().map((columna) => columna.name));
    const nuevas = {
      ium: 'TEXT',
      importador: 'TEXT',
      proveniencia_json: 'TEXT'
    };
    for (const [nombre, tipo] of Object.entries(nuevas)) {
      if (!columnas.has(nombre)) db.exec(`ALTER TABLE catalogo_cum ADD COLUMN ${nombre} ${tipo}`);
    }

    db.exec(`
      CREATE TABLE IF NOT EXISTS catalogo_codigos_pendientes (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        gtin TEXT NOT NULL UNIQUE,
        codigo_original TEXT NOT NULL,
        primer_escaneo TEXT NOT NULL DEFAULT (datetime('now')),
        ultimo_escaneo TEXT NOT NULL DEFAULT (datetime('now')),
        cantidad_escaneos INTEGER NOT NULL DEFAULT 1,
        estado TEXT NOT NULL DEFAULT 'PENDIENTE_CATALOGO',
        usuario_id INTEGER,
        FOREIGN KEY (usuario_id) REFERENCES usuarios(id)
      );
      CREATE INDEX IF NOT EXISTS idx_catalogo_pendientes_estado ON catalogo_codigos_pendientes(estado, ultimo_escaneo);
      CREATE INDEX IF NOT EXISTS idx_catalogo_cum_ium ON catalogo_cum(ium);
    `);
  },
  down(db) {
    db.exec('DROP INDEX IF EXISTS idx_catalogo_cum_ium; DROP INDEX IF EXISTS idx_catalogo_pendientes_estado; DROP TABLE IF EXISTS catalogo_codigos_pendientes;');
  }
};
