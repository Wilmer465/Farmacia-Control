import { Migration } from '../SQLiteService';

export const migration020: Migration = {
  version: 20,
  name: '020_catalogo_actualizaciones',
  up: async (db: any) => {
    await db.execAsync(`
      CREATE TABLE IF NOT EXISTS catalogo_actualizaciones (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        version TEXT NOT NULL,
        fuente_url TEXT NOT NULL,
        fecha_descarga TEXT NOT NULL,
        fecha_importacion TEXT NOT NULL DEFAULT (datetime('now')),
        registros_descargados INTEGER NOT NULL DEFAULT 0,
        registros_nuevos INTEGER NOT NULL DEFAULT 0,
        registros_actualizados INTEGER NOT NULL DEFAULT 0,
        registros_sin_cambios INTEGER NOT NULL DEFAULT 0,
        resultado TEXT NOT NULL,
        errores TEXT,
        hash_archivo TEXT,
        usuario_id INTEGER,
        FOREIGN KEY (usuario_id) REFERENCES usuarios(id)
      );

      CREATE INDEX IF NOT EXISTS idx_cat_actualiz_fecha ON catalogo_actualizaciones(fecha_importacion);
      CREATE INDEX IF NOT EXISTS idx_cat_actualiz_version ON catalogo_actualizaciones(version);
      CREATE INDEX IF NOT EXISTS idx_cat_actualiz_resultado ON catalogo_actualizaciones(resultado);
    `);
  },
  down: async (db: any) => {
    await db.execAsync(`
      DROP INDEX IF EXISTS idx_cat_actualiz_resultado;
      DROP INDEX IF EXISTS idx_cat_actualiz_version;
      DROP INDEX IF EXISTS idx_cat_actualiz_fecha;
      DROP TABLE IF EXISTS catalogo_actualizaciones;
    `);
  },
};

