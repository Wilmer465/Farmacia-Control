// Migración 004: despachos contra órdenes confirmadas/parciales, con detalle por lote.
module.exports = {
  name: '004_despachos',
  up(db) {
    db.exec(`
      CREATE TABLE despachos (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        orden_id INTEGER NOT NULL,
        sede_id INTEGER NOT NULL,
        despachado_por INTEGER NOT NULL,
        fecha TEXT NOT NULL DEFAULT (datetime('now')),
        FOREIGN KEY (orden_id) REFERENCES ordenes(id),
        FOREIGN KEY (sede_id) REFERENCES sedes(id),
        FOREIGN KEY (despachado_por) REFERENCES usuarios(id)
      );

      CREATE TABLE despacho_detalle (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        despacho_id INTEGER NOT NULL,
        orden_detalle_id INTEGER NOT NULL,
        lote_id INTEGER NOT NULL,
        medicamento_id INTEGER NOT NULL,
        cantidad_cajas_despachada INTEGER NOT NULL DEFAULT 0,
        cantidad_unidades_sueltas_despachada INTEGER NOT NULL DEFAULT 0,
        cantidad_total_despachada INTEGER NOT NULL DEFAULT 0,
        FOREIGN KEY (despacho_id) REFERENCES despachos(id),
        FOREIGN KEY (orden_detalle_id) REFERENCES orden_detalles(id),
        FOREIGN KEY (lote_id) REFERENCES lotes(id),
        FOREIGN KEY (medicamento_id) REFERENCES medicamentos(id),
        CHECK (cantidad_total_despachada > 0)
      );

      CREATE INDEX idx_despachos_orden ON despachos(orden_id);
      CREATE INDEX idx_despachos_sede ON despachos(sede_id);
      CREATE INDEX idx_despacho_detalle_despacho ON despacho_detalle(despacho_id);
      CREATE INDEX idx_despacho_detalle_lote ON despacho_detalle(lote_id);
    `);
  }
};
