// Migración 001: estructura base del sistema — roles, sedes, usuarios, auditoría.
module.exports = {
  name: '001_init',
  up(db) {
    db.exec(`
      CREATE TABLE roles (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        nombre TEXT NOT NULL UNIQUE,
        descripcion TEXT
      );

      CREATE TABLE sedes (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        nombre TEXT NOT NULL,
        ciudad TEXT,
        estado TEXT NOT NULL DEFAULT 'ACTIVO',
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      );

      CREATE TABLE usuarios (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        nombre TEXT NOT NULL,
        username TEXT NOT NULL UNIQUE,
        password_hash TEXT NOT NULL,
        rol_id INTEGER NOT NULL,
        sede_id INTEGER,               -- NULL solo permitido para SUPERADMIN (validado en servicio)
        estado TEXT NOT NULL DEFAULT 'ACTIVO',
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        FOREIGN KEY (rol_id) REFERENCES roles(id),
        FOREIGN KEY (sede_id) REFERENCES sedes(id)
      );

      CREATE TABLE auditoria (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        usuario_id INTEGER,
        rol TEXT,
        sede_id INTEGER,
        accion TEXT NOT NULL,
        modulo TEXT NOT NULL,
        registro_afectado TEXT,
        resultado TEXT NOT NULL,       -- EXITO | FALLIDO
        valores_anteriores TEXT,       -- JSON string
        valores_nuevos TEXT,           -- JSON string
        fecha TEXT NOT NULL DEFAULT (datetime('now')),
        FOREIGN KEY (usuario_id) REFERENCES usuarios(id)
      );

      CREATE INDEX idx_usuarios_sede ON usuarios(sede_id);
      CREATE INDEX idx_auditoria_usuario ON auditoria(usuario_id);
      CREATE INDEX idx_auditoria_fecha ON auditoria(fecha);
    `);
  }
};
