// Migración 005: entrega física de cada despacho — receptor, firma, huella,
// y marcado de documentación incompleta (sección 16 del spec).
module.exports = {
  name: '005_entregas',
  up(db) {
    db.exec(`
      CREATE TABLE entregas (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        despacho_id INTEGER NOT NULL UNIQUE,
        orden_id INTEGER NOT NULL,
        sede_id INTEGER NOT NULL,
        receptor_nombre TEXT,
        receptor_documento TEXT,
        firma_data TEXT,               -- imagen del pad de firma en base64, NULL si no firmó
        huella_registrada INTEGER NOT NULL DEFAULT 0,
        entregado_por INTEGER NOT NULL,
        fecha TEXT NOT NULL DEFAULT (datetime('now')),
        documentacion_completa INTEGER NOT NULL DEFAULT 0,
        elementos_faltantes TEXT,      -- JSON array, ej: ["FIRMA","HUELLA"]
        FOREIGN KEY (despacho_id) REFERENCES despachos(id),
        FOREIGN KEY (orden_id) REFERENCES ordenes(id),
        FOREIGN KEY (sede_id) REFERENCES sedes(id),
        FOREIGN KEY (entregado_por) REFERENCES usuarios(id)
      );

      CREATE INDEX idx_entregas_sede ON entregas(sede_id);
      CREATE INDEX idx_entregas_completa ON entregas(documentacion_completa);
    `);
  }
};
