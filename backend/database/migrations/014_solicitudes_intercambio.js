// Migración 014: Solicitudes de envío e intercambio de medicamentos entre sedes.
// Permite a Superadmin y Administrador de sede solicitar traspasos/intercambios entre sedes.
module.exports = {
  name: '014_solicitudes_intercambio',
  up(db) {
    db.exec(`
      CREATE TABLE IF NOT EXISTS solicitudes_intercambio (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        tipo TEXT NOT NULL DEFAULT 'ENVIO',                -- 'ENVIO' | 'INTERCAMBIO'
        sede_origen_id INTEGER NOT NULL,
        sede_destino_id INTEGER NOT NULL,
        lote_id INTEGER NOT NULL,
        medicamento_id INTEGER NOT NULL,
        cantidad_cajas INTEGER NOT NULL DEFAULT 0,
        cantidad_unidades INTEGER NOT NULL DEFAULT 0,
        cantidad_total_unidades INTEGER NOT NULL,
        motivo TEXT NOT NULL,
        estado TEXT NOT NULL DEFAULT 'PENDIENTE',          -- 'PENDIENTE' | 'APROBADA' | 'RECHAZADA'
        usuario_solicitante_id INTEGER NOT NULL,
        usuario_resolutor_id INTEGER,
        fecha_solicitud TEXT NOT NULL DEFAULT (datetime('now')),
        fecha_resolucion TEXT,
        observacion_resolucion TEXT,
        FOREIGN KEY (sede_origen_id) REFERENCES sedes(id),
        FOREIGN KEY (sede_destino_id) REFERENCES sedes(id),
        FOREIGN KEY (lote_id) REFERENCES lotes(id),
        FOREIGN KEY (medicamento_id) REFERENCES medicamentos(id),
        FOREIGN KEY (usuario_solicitante_id) REFERENCES usuarios(id),
        FOREIGN KEY (usuario_resolutor_id) REFERENCES usuarios(id),
        CHECK (cantidad_cajas >= 0),
        CHECK (cantidad_unidades >= 0),
        CHECK (cantidad_total_unidades > 0)
      );

      CREATE INDEX IF NOT EXISTS idx_sol_intercambio_origen ON solicitudes_intercambio(sede_origen_id);
      CREATE INDEX IF NOT EXISTS idx_sol_intercambio_destino ON solicitudes_intercambio(sede_destino_id);
      CREATE INDEX IF NOT EXISTS idx_sol_intercambio_estado ON solicitudes_intercambio(estado);
      CREATE INDEX IF NOT EXISTS idx_sol_intercambio_lote ON solicitudes_intercambio(lote_id);
    `);
  }
};
