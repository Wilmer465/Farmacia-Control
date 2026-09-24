import { Migration } from '../SQLiteService';

export const migration016: Migration = {
  version: 16,
  name: '016_intercambio_medicamento_recibido',
  up: async (db: any) => {
    const cols = db.prepare("PRAGMA table_info(solicitudes_intercambio)").all().map((c: any) => c.name);
    if (!cols.includes('sede_recibe_id')) {
      await db.execAsync("ALTER TABLE solicitudes_intercambio ADD COLUMN sede_recibe_id INTEGER;");
    }
    if (!cols.includes('lote_recibe_id')) {
      await db.execAsync("ALTER TABLE solicitudes_intercambio ADD COLUMN lote_recibe_id INTEGER;");
    }
    if (!cols.includes('medicamento_recibe_id')) {
      await db.execAsync("ALTER TABLE solicitudes_intercambio ADD COLUMN medicamento_recibe_id INTEGER;");
    }
    if (!cols.includes('cantidad_recibe_total_unidades')) {
      await db.execAsync("ALTER TABLE solicitudes_intercambio ADD COLUMN cantidad_recibe_total_unidades INTEGER;");
    }
    await db.execAsync("CREATE INDEX IF NOT EXISTS idx_sol_intercambio_lote_recibe ON solicitudes_intercambio(lote_recibe_id);");
  },
};

