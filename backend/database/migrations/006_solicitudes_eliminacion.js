// Migración 006: solicitudes de eliminación (sección 17-18 del spec).
// Nada se elimina directo — se solicita, y solo SUPERADMIN aprueba o rechaza.
// El historial de la solicitud permanece siempre, sea cual sea la decisión.
module.exports = {
  name: '006_solicitudes_eliminacion',
  up(db) {
    db.exec(`
      CREATE TABLE solicitudes_eliminacion (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        sede_id INTEGER NOT NULL,
        usuario_solicitante_id INTEGER NOT NULL,
        tipo_registro TEXT NOT NULL DEFAULT 'LOTE',
        registro_id INTEGER NOT NULL,          -- id del lote referenciado
        medicamento_id INTEGER,
        motivo TEXT NOT NULL,
        estado TEXT NOT NULL DEFAULT 'PENDIENTE',  -- PENDIENTE|APROBADA|RECHAZADA
        usuario_resolutor_id INTEGER,
        fecha_resolucion TEXT,
        observacion_resolucion TEXT,
        fecha_solicitud TEXT NOT NULL DEFAULT (datetime('now')),
        FOREIGN KEY (sede_id) REFERENCES sedes(id),
        FOREIGN KEY (usuario_solicitante_id) REFERENCES usuarios(id),
        FOREIGN KEY (usuario_resolutor_id) REFERENCES usuarios(id),
        FOREIGN KEY (medicamento_id) REFERENCES medicamentos(id)
      );

      CREATE INDEX idx_solicitudes_sede ON solicitudes_eliminacion(sede_id);
      CREATE INDEX idx_solicitudes_estado ON solicitudes_eliminacion(estado);
    `);
  }
};
