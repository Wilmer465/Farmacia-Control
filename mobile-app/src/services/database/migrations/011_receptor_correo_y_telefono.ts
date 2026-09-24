import { Migration } from '../SQLiteService';

export const migration011: Migration = {
  version: 11,
  name: '011_receptor_correo_y_telefono',
  up: async (db: any) => {
    const cols = db.prepare("PRAGMA table_info(receptores)").all().map((c: any) => c.name);
    if (!cols.includes('telefono')) {
      await db.execAsync("ALTER TABLE receptores ADD COLUMN telefono TEXT;");
    }
    if (!cols.includes('correo_electronico')) {
      await db.execAsync("ALTER TABLE receptores ADD COLUMN correo_electronico TEXT;");
    }
    await db.execAsync("CREATE INDEX IF NOT EXISTS idx_receptores_correo ON receptores(correo_electronico);");
  },
};

