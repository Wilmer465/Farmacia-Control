import { Migration } from '../SQLiteService';

export const migration015: Migration = {
  version: 15,
  name: '015_pacientes_prioridad_medicamentos',
  up: async (db: any) => {
    const colsResult = await db.getAllAsync("PRAGMA table_info(receptores)");
    const cols = colsResult.map((c: any) => c.name);

    if (!cols.includes('prioridad')) {
      await db.execAsync("ALTER TABLE receptores ADD COLUMN prioridad TEXT NOT NULL DEFAULT 'MEDIA';");
    }

    if (!cols.includes('medicamentos_uso')) {
      await db.execAsync("ALTER TABLE receptores ADD COLUMN medicamentos_uso TEXT;");
    }

    if (!cols.includes('notas')) {
      await db.execAsync("ALTER TABLE receptores ADD COLUMN notas TEXT;");
    }

    await db.execAsync("CREATE INDEX IF NOT EXISTS idx_receptores_prioridad ON receptores(prioridad);");
  },
};

