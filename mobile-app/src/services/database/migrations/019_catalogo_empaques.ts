import { Migration } from '../SQLiteService';

export const migration019: Migration = {
  version: 19,
  name: '019_catalogo_empaques',
  up: async (db: any) => {
    await db.execAsync(`
      CREATE TABLE IF NOT EXISTS catalogo_empaques (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        catalogo_cum_id INTEGER NOT NULL,
        nivel INTEGER NOT NULL CHECK (nivel IN (1,2,3)),
        gtin TEXT NOT NULL UNIQUE,
        descripcion TEXT,
        contenido_cantidad INTEGER NOT NULL,
        contenido_unidad TEXT NOT NULL,
        factor_conversion INTEGER NOT NULL DEFAULT 1,
        es_principal INTEGER NOT NULL DEFAULT 0,
        FOREIGN KEY (catalogo_cum_id) REFERENCES catalogo_cum(id) ON DELETE CASCADE,
        UNIQUE (catalogo_cum_id, nivel)
      );

      CREATE INDEX IF NOT EXISTS idx_empaques_gtin ON catalogo_empaques(gtin);
      CREATE INDEX IF NOT EXISTS idx_empaques_cum ON catalogo_empaques(catalogo_cum_id);
      CREATE INDEX IF NOT EXISTS idx_empaques_nivel ON catalogo_empaques(nivel);
    `);
  },
  down: async (db: any) => {
    await db.execAsync(`
      DROP INDEX IF EXISTS idx_empaques_nivel;
      DROP INDEX IF EXISTS idx_empaques_cum;
      DROP INDEX IF EXISTS idx_empaques_gtin;
      DROP TABLE IF EXISTS catalogo_empaques;
    `);
  },
};

