import { Migration } from '../SQLiteService';

export const migration007: Migration = {
  version: 7,
  name: '007_movimientos_inventario',
  up: async (db: any) => {
    await db.execAsync(`
      CREATE TABLE IF NOT EXISTS movimientos_inventario (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        lote_id INTEGER NOT NULL,
        medicamento_id INTEGER NOT NULL,
        sede_id INTEGER NOT NULL,
        tipo TEXT NOT NULL,
        cantidad INTEGER NOT NULL,
        referencia_orden_id INTEGER,
        usuario_id INTEGER,
        empaque_nivel INTEGER,
        cantidad_unidades_base INTEGER,
        fecha TEXT NOT NULL DEFAULT (datetime('now')),
        FOREIGN KEY (lote_id) REFERENCES lotes(id),
        FOREIGN KEY (medicamento_id) REFERENCES medicamentos(id),
        FOREIGN KEY (sede_id) REFERENCES sedes(id),
        FOREIGN KEY (referencia_orden_id) REFERENCES ordenes(id),
        FOREIGN KEY (usuario_id) REFERENCES usuarios(id)
      );

      CREATE INDEX IF NOT EXISTS idx_movimientos_lote ON movimientos_inventario(lote_id);
      CREATE INDEX IF NOT EXISTS idx_movimientos_sede ON movimientos_inventario(sede_id);
      CREATE INDEX IF NOT EXISTS idx_movimientos_fecha ON movimientos_inventario(fecha);
      CREATE INDEX IF NOT EXISTS idx_movimientos_medicamento ON movimientos_inventario(medicamento_id);
      CREATE INDEX IF NOT EXISTS idx_movimientos_orden ON movimientos_inventario(referencia_orden_id);
    `);
  },
};

