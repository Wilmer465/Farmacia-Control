import { Migration } from '../SQLiteService';

export const migration001: Migration = {
  version: 1,
  name: '001_init',
  up: async (db: any) => {
    await db.execAsync(`
      CREATE TABLE IF NOT EXISTS roles (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        nombre TEXT NOT NULL UNIQUE,
        descripcion TEXT
      );

      CREATE TABLE IF NOT EXISTS sedes (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        nombre TEXT NOT NULL,
        ciudad TEXT,
        estado TEXT NOT NULL DEFAULT 'ACTIVO',
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      );

      CREATE TABLE IF NOT EXISTS usuarios (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        nombre TEXT NOT NULL,
        username TEXT NOT NULL UNIQUE,
        password_hash TEXT NOT NULL,
        rol_id INTEGER NOT NULL,
        sede_id INTEGER,
        estado TEXT NOT NULL DEFAULT 'ACTIVO',
        es_superadmin_principal INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        FOREIGN KEY (rol_id) REFERENCES roles(id),
        FOREIGN KEY (sede_id) REFERENCES sedes(id)
      );

      CREATE TABLE IF NOT EXISTS auditoria (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        usuario_id INTEGER,
        rol TEXT,
        sede_id INTEGER,
        accion TEXT NOT NULL,
        modulo TEXT NOT NULL,
        registro_afectado TEXT,
        resultado TEXT NOT NULL,
        valores_anteriores TEXT,
        valores_nuevos TEXT,
        fecha TEXT NOT NULL DEFAULT (datetime('now')),
        device_id TEXT,
        sync_id TEXT,
        plataforma TEXT,
        FOREIGN KEY (usuario_id) REFERENCES usuarios(id)
      );

      CREATE INDEX IF NOT EXISTS idx_usuarios_sede ON usuarios(sede_id);
      CREATE INDEX IF NOT EXISTS idx_usuarios_username ON usuarios(username);
      CREATE INDEX IF NOT EXISTS idx_auditoria_usuario ON auditoria(usuario_id);
      CREATE INDEX IF NOT EXISTS idx_auditoria_fecha ON auditoria(fecha);
      CREATE INDEX IF NOT EXISTS idx_auditoria_sede ON auditoria(sede_id);
    `);
  },
};

