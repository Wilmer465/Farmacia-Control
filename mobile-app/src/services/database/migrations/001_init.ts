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

    await db.execAsync(`
      INSERT OR IGNORE INTO roles (id, nombre, descripcion) VALUES
        (1, 'SUPERADMIN', 'Super administrador del sistema'),
        (2, 'ADMIN', 'Administrador de sede'),
        (3, 'BODEGA', 'Personal de bodega'),
        (4, 'ENFERMERIA', 'Personal de enfermería'),
        (5, 'MEDICO', 'Médico');

      INSERT OR IGNORE INTO sedes (id, nombre, ciudad, estado) VALUES
        (1, 'Sede Principal', 'Quibdó', 'ACTIVO');
    `);

    // bcrypt (coste 12) de 'admin123*', el mismo formato que verifica
    // `AuthService.verifyPassword` con bcryptjs. La API central siembra el mismo
    // usuario con la misma clave, asi que login remoto y login local comparten
    // credenciales.
    const adminHash = '$2a$12$JUvGaw13XEm44DjzTwGLJ.vyEfwUmb.CUEXvbcpJIe70qV6pFUESi';
    // OJO: hay que usar runAsync y no execAsync para sentencia con parametros.
    // En web la implementacion de expo-sqlite declara `execAsync(source: string)`
    // sin `bindParams`: los `?` nunca se enlazan, el INSERT falla por la
    // restriccion NOT NULL de password_hash y la sentencia se descarta en
    // silencio, dejando la tabla `usuarios` vacia (y por tanto imposible
    // iniciar sesion en modo local). runAsync si enlaza parametros en web.
    await db.runAsync(
      `INSERT OR IGNORE INTO usuarios (id, nombre, username, password_hash, rol_id, sede_id, estado, es_superadmin_principal)
       VALUES (1, 'Super Admin', 'admin', ?, 1, 1, 'ACTIVO', 1);`,
      [adminHash]
    );
  },
};

