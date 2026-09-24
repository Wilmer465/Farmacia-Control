import { Migration } from '../SQLiteService';

export const migration008: Migration = {
  version: 8,
  name: '008_destino_ordenes',
  up: async (db: any) => {
    try {
      await db.execAsync(`
        ALTER TABLE ordenes ADD COLUMN tipo_destino TEXT NOT NULL DEFAULT 'LOCAL';
        ALTER TABLE ordenes ADD COLUMN destino_detalle TEXT;
      `);
    } catch (e) {
      // Columns might already exist
    }

    try {
      await db.execAsync(`
        ALTER TABLE entregas ADD COLUMN tipo_destino TEXT NOT NULL DEFAULT 'LOCAL';
        ALTER TABLE entregas ADD COLUMN destino_detalle TEXT;
      `);
    } catch (e) {
      // Columns might already exist
    }
  },
};

