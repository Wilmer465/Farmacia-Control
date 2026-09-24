import { Migration } from '../SQLiteService';

export const migration013: Migration = {
  version: 13,
  name: '013_estado_pendiente',
  up: async (db: any) => {
    await db.execAsync("UPDATE ordenes SET estado = 'PENDIENTE' WHERE estado = 'CONFIRMADA';");
  },
};

