import { Migration } from '../SQLiteService';

export const migration025: Migration = {
  version: 25,
  name: '025_mobile_auditoria_local',
  up: async (db: any) => {
    await db.execAsync(`
      CREATE TABLE IF NOT EXISTS auditoria_local (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        usuario_id INTEGER NOT NULL,
        rol TEXT NOT NULL,
        sede_id INTEGER,
        accion TEXT NOT NULL,
        modulo TEXT NOT NULL,
        entidad TEXT,
        entidad_id INTEGER,
        valores_anteriores TEXT,
        valores_nuevos TEXT,
        device_id TEXT NOT NULL,
        sync_id TEXT,
        fecha TEXT NOT NULL DEFAULT (datetime('now')),
        resultado TEXT NOT NULL DEFAULT 'EXITO'
      );

      CREATE INDEX IF NOT EXISTS idx_auditoria_local_fecha ON auditoria_local(fecha);
      CREATE INDEX IF NOT EXISTS idx_auditoria_local_usuario ON auditoria_local(usuario_id);
      CREATE INDEX IF NOT EXISTS idx_auditoria_local_sede ON auditoria_local(sede_id);
      CREATE INDEX IF NOT EXISTS idx_auditoria_local_sync ON auditoria_local(sync_id);
      CREATE INDEX IF NOT EXISTS idx_auditoria_local_device ON auditoria_local(device_id);
    `);
  },
  down: async (db: any) => {
    await db.execAsync(`
      DROP INDEX IF EXISTS idx_auditoria_local_device;
      DROP INDEX IF EXISTS idx_auditoria_local_sync;
      DROP INDEX IF EXISTS idx_auditoria_local_sede;
      DROP INDEX IF EXISTS idx_auditoria_local_usuario;
      DROP INDEX IF EXISTS idx_auditoria_local_fecha;
      DROP TABLE IF EXISTS auditoria_local;
    `);
  },
};

