import { Migration } from '../SQLiteService';

export const migration003: Migration = {
  version: 3,
  name: '003_ordenes',
  up: async (db: any) => {
    await db.execAsync(`
      CREATE TABLE IF NOT EXISTS ordenes (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        numero TEXT NOT NULL UNIQUE,
        sede_id INTEGER NOT NULL,
        estado TEXT NOT NULL DEFAULT 'PENDIENTE',
        motivo_cancelacion TEXT,
        usuario_creador_id INTEGER NOT NULL,
        tipo_destino TEXT NOT NULL DEFAULT 'LOCAL',
        destino_detalle TEXT,
        receptor_nombre TEXT,
        receptor_documento TEXT,
        receptor_telefono TEXT,
        receptor_correo TEXT,
        firma_data TEXT,
        huella_registrada INTEGER NOT NULL DEFAULT 0,
        documento_adjunto_nombre TEXT,
        documento_adjunto_data TEXT,
        documento_adjunto_tipo TEXT,
        documentacion_completa INTEGER NOT NULL DEFAULT 0,
        elementos_faltantes TEXT,
        fecha_creacion TEXT NOT NULL DEFAULT (datetime('now')),
        fecha_actualizacion TEXT NOT NULL DEFAULT (datetime('now')),
        FOREIGN KEY (sede_id) REFERENCES sedes(id),
        FOREIGN KEY (usuario_creador_id) REFERENCES usuarios(id)
      );

      CREATE TABLE IF NOT EXISTS orden_detalles (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        orden_id INTEGER NOT NULL,
        medicamento_id INTEGER NOT NULL,
        cantidad_cajas_solicitada INTEGER NOT NULL DEFAULT 0,
        cantidad_unidades_solicitada INTEGER NOT NULL DEFAULT 0,
        cantidad_total_solicitada INTEGER NOT NULL DEFAULT 0,
        cantidad_total_despachada INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        FOREIGN KEY (orden_id) REFERENCES ordenes(id) ON DELETE CASCADE,
        FOREIGN KEY (medicamento_id) REFERENCES medicamentos(id),
        CHECK (cantidad_cajas_solicitada >= 0),
        CHECK (cantidad_unidades_solicitada >= 0),
        CHECK (cantidad_total_despachada >= 0)
      );

      CREATE INDEX IF NOT EXISTS idx_ordenes_sede ON ordenes(sede_id);
      CREATE INDEX IF NOT EXISTS idx_ordenes_estado ON ordenes(estado);
      CREATE INDEX IF NOT EXISTS idx_ordenes_numero ON ordenes(numero);
      CREATE INDEX IF NOT EXISTS idx_orden_detalles_orden ON orden_detalles(orden_id);
    `);
  },
};

