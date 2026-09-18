// Migración 020: Historial de actualizaciones del catálogo CUM
module.exports = {
  name: '020_catalogo_actualizaciones',
  up(db) {
    db.exec(`
      CREATE TABLE catalogo_actualizaciones (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        version TEXT NOT NULL,                         -- "2026-08-16"
        fuente_url TEXT NOT NULL,
        fecha_descarga TEXT NOT NULL,
        fecha_importacion TEXT NOT NULL DEFAULT (datetime('now')),
        registros_descargados INTEGER NOT NULL DEFAULT 0,
        registros_nuevos INTEGER NOT NULL DEFAULT 0,
        registros_actualizados INTEGER NOT NULL DEFAULT 0,
        registros_sin_cambios INTEGER NOT NULL DEFAULT 0,
        resultado TEXT NOT NULL,                       -- EXITO | PARCIAL | ERROR
        errores TEXT,                                  -- JSON array
        hash_archivo TEXT,                             -- SHA256 del archivo descargado
        usuario_id INTEGER,                            -- Quién inició (manual/auto)
        FOREIGN KEY (usuario_id) REFERENCES usuarios(id)
      );

      CREATE INDEX idx_cat_actualiz_fecha ON catalogo_actualizaciones(fecha_importacion);
      CREATE INDEX idx_cat_actualiz_version ON catalogo_actualizaciones(version);
      CREATE INDEX idx_cat_actualiz_resultado ON catalogo_actualizaciones(resultado);
    `);
  },
  down(db) {
    db.exec(`
      DROP INDEX IF EXISTS idx_cat_actualiz_resultado;
      DROP INDEX IF EXISTS idx_cat_actualiz_version;
      DROP INDEX IF EXISTS idx_cat_actualiz_fecha;
      DROP TABLE IF EXISTS catalogo_actualizaciones;
    `);
  }
};