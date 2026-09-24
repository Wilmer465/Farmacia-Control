import { Migration } from '../SQLiteService';

export const migration006: Migration = {
  version: 6,
  name: '006_solicitudes_eliminacion',
  up: async (db: any) => {
    await db.execAsync(`
      CREATE TABLE IF NOT EXISTS solicitudes_eliminacion (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        sede_id INTEGER NOT NULL,
        usuario_solicitante_id INTEGER NOT NULL,
        tipo_registro TEXT NOT NULL DEFAULT 'LOTE',
        registro_id INTEGER NOT NULL,
        medicamento_id INTEGER,
        motivo TEXT NOT NULL,
        estado TEXT NOT NULL DEFAULT 'PENDIENTE',
        usuario_resolutor_id INTEGER,
        fecha_resolucion TEXT,
        observacion_resolucion TEXT,
        fecha_solicitud TEXT NOT NULL DEFAULT (datetime('now')),
        FOREIGN KEY (sede_id) REFERENCES sedes(id),
        FOREIGN KEY (usuario_solicitante_id) REFERENCES usuarios(id),
        FOREIGN KEY (usuario_resolutor_id) REFERENCES usuarios(id),
        FOREIGN KEY (medicamento_id) REFERENCES medicamentos(id)
      );

      CREATE INDEX IF NOT EXISTS idx_solicitudes_sede ON solicitudes_eliminacion(sede_id);
      CREATE INDEX IF NOT EXISTS idx_solicitudes_estado ON solicitudes_eliminacion(estado);
      CREATE INDEX IF NOT EXISTS idx_solicitudes_registro ON solicitudes_eliminacion(registro_id);
    `);
  },
};

