import { Migration } from '../SQLiteService';

export const migration022: Migration = {
  version: 22,
  name: '022_catalogo_cum_documentos',
  up: async (db: any) => {
    const colsResult = await db.getAllAsync("PRAGMA table_info(catalogo_cum)");
    const cols = colsResult.map((r: any) => r.name);

    if (!cols.includes('documento_adjunto_nombre')) {
      await db.execAsync("ALTER TABLE catalogo_cum ADD COLUMN documento_adjunto_nombre TEXT;");
    }
    if (!cols.includes('documento_adjunto_data')) {
      await db.execAsync("ALTER TABLE catalogo_cum ADD COLUMN documento_adjunto_data TEXT;");
    }
    if (!cols.includes('documento_adjunto_tipo')) {
      await db.execAsync("ALTER TABLE catalogo_cum ADD COLUMN documento_adjunto_tipo TEXT;");
    }
  },
  down: async (db: any) => {
    await db.execAsync("ALTER TABLE catalogo_cum DROP COLUMN documento_adjunto_tipo;");
    await db.execAsync("ALTER TABLE catalogo_cum DROP COLUMN documento_adjunto_data;");
    await db.execAsync("ALTER TABLE catalogo_cum DROP COLUMN documento_adjunto_nombre;");
  },
};

