// Migración 003: órdenes de medicamentos y sus líneas de detalle.
module.exports = {
  name: '003_ordenes',
  up(db) {
    db.exec(`
      CREATE TABLE ordenes (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        numero TEXT NOT NULL UNIQUE,
        sede_id INTEGER NOT NULL,
        estado TEXT NOT NULL DEFAULT 'PENDIENTE',   -- PENDIENTE|CONFIRMADA|PARCIAL|COMPLETADA|CANCELADA
        motivo_cancelacion TEXT,
        usuario_creador_id INTEGER NOT NULL,
        fecha_creacion TEXT NOT NULL DEFAULT (datetime('now')),
        fecha_actualizacion TEXT NOT NULL DEFAULT (datetime('now')),
        FOREIGN KEY (sede_id) REFERENCES sedes(id),
        FOREIGN KEY (usuario_creador_id) REFERENCES usuarios(id)
      );

      CREATE TABLE orden_detalles (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        orden_id INTEGER NOT NULL,
        medicamento_id INTEGER NOT NULL,
        cantidad_cajas_solicitada INTEGER NOT NULL DEFAULT 0,
        cantidad_unidades_solicitada INTEGER NOT NULL DEFAULT 0,
        cantidad_total_solicitada INTEGER NOT NULL DEFAULT 0,
        cantidad_total_despachada INTEGER NOT NULL DEFAULT 0,  -- lo actualiza el módulo de Despachos (Fase 4)
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        FOREIGN KEY (orden_id) REFERENCES ordenes(id) ON DELETE CASCADE,
        FOREIGN KEY (medicamento_id) REFERENCES medicamentos(id),
        CHECK (cantidad_cajas_solicitada >= 0),
        CHECK (cantidad_unidades_solicitada >= 0),
        CHECK (cantidad_total_despachada >= 0)
      );

      CREATE INDEX idx_ordenes_sede ON ordenes(sede_id);
      CREATE INDEX idx_ordenes_estado ON ordenes(estado);
      CREATE INDEX idx_orden_detalles_orden ON orden_detalles(orden_id);
    `);
  }
};
