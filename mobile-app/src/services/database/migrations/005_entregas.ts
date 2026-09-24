import { Migration } from '../SQLiteService';

export const migration005: Migration = {
  version: 5,
  name: '005_entregas',
  up: async (db: any) => {
    await db.execAsync(`
      CREATE TABLE IF NOT EXISTS entregas (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        despacho_id INTEGER NOT NULL UNIQUE,
        orden_id INTEGER NOT NULL,
        sede_id INTEGER NOT NULL,
        receptor_nombre TEXT,
        receptor_documento TEXT,
        firma_data TEXT,
        huella_registrada INTEGER NOT NULL DEFAULT 0,
        entregado_por INTEGER NOT NULL,
        fecha TEXT NOT NULL DEFAULT (datetime('now')),
        documentacion_completa INTEGER NOT NULL DEFAULT 0,
        elementos_faltantes TEXT,
        documento_adjunto_nombre TEXT,
        documento_adjunto_data TEXT,
        documento_adjunto_tipo TEXT,
        tipo_destino TEXT NOT NULL DEFAULT 'LOCAL',
        destino_detalle TEXT,
        FOREIGN KEY (despacho_id) REFERENCES despachos(id),
        FOREIGN KEY (orden_id) REFERENCES ordenes(id),
        FOREIGN KEY (sede_id) REFERENCES sedes(id),
        FOREIGN KEY (entregado_por) REFERENCES usuarios(id)
      );

      CREATE INDEX IF NOT EXISTS idx_entregas_sede ON entregas(sede_id);
      CREATE INDEX IF NOT EXISTS idx_entregas_completa ON entregas(documentacion_completa);
      CREATE INDEX IF NOT EXISTS idx_entregas_orden ON entregas(orden_id);
    `);
  },
};

