import { Migration } from '../SQLiteService';

export const migration024: Migration = {
  version: 24,
  name: '024_mobile_notificaciones_mensajes',
  up: async (db: any) => {
    await db.execAsync(`
      CREATE TABLE IF NOT EXISTS notificaciones_locales (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        remote_id TEXT UNIQUE,
        tipo TEXT NOT NULL,
        titulo TEXT NOT NULL,
        mensaje TEXT NOT NULL,
        datos_json TEXT,
        leida INTEGER NOT NULL DEFAULT 0,
        fecha TEXT NOT NULL DEFAULT (datetime('now'))
      );

      CREATE TABLE IF NOT EXISTS mensajes_locales (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        remote_id TEXT UNIQUE,
        asunto TEXT NOT NULL,
        contenido TEXT NOT NULL,
        solicitud_relacionada_id INTEGER,
        leido INTEGER NOT NULL DEFAULT 0,
        fecha TEXT NOT NULL DEFAULT (datetime('now'))
      );

      CREATE INDEX IF NOT EXISTS idx_notificaciones_fecha ON notificaciones_locales(fecha);
      CREATE INDEX IF NOT EXISTS idx_notificaciones_leida ON notificaciones_locales(leida);
      CREATE INDEX IF NOT EXISTS idx_notificaciones_remote ON notificaciones_locales(remote_id);
      CREATE INDEX IF NOT EXISTS idx_mensajes_fecha ON mensajes_locales(fecha);
      CREATE INDEX IF NOT EXISTS idx_mensajes_leido ON mensajes_locales(leido);
      CREATE INDEX IF NOT EXISTS idx_mensajes_remote ON mensajes_locales(remote_id);
    `);
  },
  down: async (db: any) => {
    await db.execAsync(`
      DROP INDEX IF EXISTS idx_mensajes_remote;
      DROP INDEX IF EXISTS idx_mensajes_leido;
      DROP INDEX IF EXISTS idx_mensajes_fecha;
      DROP INDEX IF EXISTS idx_notificaciones_remote;
      DROP INDEX IF EXISTS idx_notificaciones_leida;
      DROP INDEX IF EXISTS idx_notificaciones_fecha;
      DROP TABLE IF EXISTS mensajes_locales;
      DROP TABLE IF EXISTS notificaciones_locales;
    `);
  },
};

