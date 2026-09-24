import { Migration } from '../SQLiteService';

export const migration017: Migration = {
  version: 17,
  name: '017_indices_y_optimizacion_multisede',
  up: async (db: any) => {
    await db.execAsync(`
      CREATE INDEX IF NOT EXISTS idx_lotes_sede_med_disp ON lotes(sede_id, medicamento_id, estado_manual);
      CREATE INDEX IF NOT EXISTS idx_ordenes_sede_fecha ON ordenes(sede_id, fecha_creacion);
      CREATE INDEX IF NOT EXISTS idx_movimientos_lote_sede ON movimientos_inventario(lote_id, sede_id);
      CREATE INDEX IF NOT EXISTS idx_entregas_receptor ON entregas(receptor_documento);
      CREATE INDEX IF NOT EXISTS idx_solicitudes_intercambio_sedes ON solicitudes_intercambio(sede_origen_id, sede_destino_id, estado);
    `);
  },
  down: async (db: any) => {
    await db.execAsync(`
      DROP INDEX IF EXISTS idx_lotes_sede_med_disp;
      DROP INDEX IF EXISTS idx_ordenes_sede_fecha;
      DROP INDEX IF EXISTS idx_movimientos_lote_sede;
      DROP INDEX IF EXISTS idx_entregas_receptor;
      DROP INDEX IF EXISTS idx_solicitudes_intercambio_sedes;
    `);
  },
};

