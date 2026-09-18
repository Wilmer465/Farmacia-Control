// Migración 019: Niveles de empaque y factores de conversión para catálogo CUM
module.exports = {
  name: '019_catalogo_empaques',
  up(db) {
    db.exec(`
      CREATE TABLE catalogo_empaques (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        catalogo_cum_id INTEGER NOT NULL,
        nivel INTEGER NOT NULL CHECK (nivel IN (1,2,3)),  -- 1=Logístico, 2=Venta, 3=Unidad
        gtin TEXT NOT NULL UNIQUE,
        descripcion TEXT,                              -- "Caja logística 40 cajas"
        contenido_cantidad INTEGER NOT NULL,           -- 40 (cajas), 20 (tabletas)
        contenido_unidad TEXT NOT NULL,                -- "CAJA", "TABLETA", "FRASCO", etc.
        factor_conversion INTEGER NOT NULL DEFAULT 1,  -- Hacia nivel inferior (unidades base)
        es_principal INTEGER NOT NULL DEFAULT 0,       -- GTIN principal para búsqueda
        FOREIGN KEY (catalogo_cum_id) REFERENCES catalogo_cum(id) ON DELETE CASCADE,
        UNIQUE (catalogo_cum_id, nivel)
      );

      CREATE INDEX idx_empaques_gtin ON catalogo_empaques(gtin);
      CREATE INDEX idx_empaques_cum ON catalogo_empaques(catalogo_cum_id);
      CREATE INDEX idx_empaques_nivel ON catalogo_empaques(nivel);
    `);
  },
  down(db) {
    db.exec(`
      DROP INDEX IF EXISTS idx_empaques_nivel;
      DROP INDEX IF EXISTS idx_empaques_cum;
      DROP INDEX IF EXISTS idx_empaques_gtin;
      DROP TABLE IF EXISTS catalogo_empaques;
    `);
  }
};