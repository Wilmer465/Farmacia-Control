import { Migration } from '../SQLiteService';

export const migration026: Migration = {
  version: 26,
  name: '026_mobile_dispositivos',
  up: async (db: any) => {
    await db.execAsync(`
      CREATE TABLE IF NOT EXISTS dispositivos (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        usuario_id INTEGER NOT NULL,
        device_id TEXT NOT NULL UNIQUE,
        platform TEXT NOT NULL CHECK (platform IN ('ios', 'android')),
        app_version TEXT NOT NULL,
        push_token TEXT,
        ultima_sync TEXT,
        activo INTEGER NOT NULL DEFAULT 1,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now')),
        FOREIGN KEY (usuario_id) REFERENCES usuarios(id)
      );

      CREATE INDEX IF NOT EXISTS idx_dispositivos_usuario ON dispositivos(usuario_id);
      CREATE INDEX IF NOT EXISTS idx_dispositivos_device_id ON dispositivos(device_id);
      CREATE INDEX IF NOT EXISTS idx_dispositivos_activo ON dispositivos(activo);
    `);
  },
  down: async (db: any) => {
    await db.execAsync(`
      DROP INDEX IF EXISTS idx_dispositivos_activo;
      DROP INDEX IF EXISTS idx_dispositivos_device_id;
      DROP INDEX IF EXISTS idx_dispositivos_usuario;
      DROP TABLE IF EXISTS dispositivos;
    `);
  },
};

