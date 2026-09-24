import { Migration } from '../SQLiteService';

export const migration018: Migration = {
  version: 18,
  name: '018_catalogo_cum',
  up: async (db: any) => {
    await db.execAsync(`
      CREATE TABLE IF NOT EXISTS catalogo_cum (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        expediente INTEGER NOT NULL,
        consecutivocum INTEGER NOT NULL,
        cum TEXT NOT NULL UNIQUE,
        producto TEXT NOT NULL,
        descripcioncomercial TEXT,
        principio_activo TEXT,
        concentracion TEXT,
        forma_farmaceutica TEXT,
        via_administracion TEXT,
        unidad_medida TEXT,
        cantidad_presentacion REAL,
        registro_sanitario TEXT,
        fecha_expedicion_registro TEXT,
        fecha_vencimiento_registro TEXT,
        estado_registro TEXT,
        estado_cum TEXT,
        fecha_activo TEXT,
        fecha_inactivo TEXT,
        titular TEXT,
        laboratorio TEXT,
        fabricante TEXT,
        pais_fabricante TEXT,
        condicion_venta TEXT,
        tipo_producto TEXT,
        atc_codigo TEXT,
        atc_descripcion TEXT,
        gtin TEXT,
        gtin_empaque_logistico TEXT,
        gtin_empaque_venta TEXT,
        fuente TEXT NOT NULL DEFAULT 'INVIMA',
        version_catalogo TEXT NOT NULL,
        fecha_importacion TEXT NOT NULL DEFAULT (datetime('now')),
        hash_fila TEXT,
        documento_adjunto_nombre TEXT,
        documento_adjunto_data TEXT,
        documento_adjunto_tipo TEXT,
        creado_en TEXT NOT NULL DEFAULT (datetime('now')),
        actualizado_en TEXT NOT NULL DEFAULT (datetime('now'))
      );

      CREATE INDEX IF NOT EXISTS idx_catalogo_cum_cum ON catalogo_cum(cum);
      CREATE INDEX IF NOT EXISTS idx_catalogo_cum_gtin ON catalogo_cum(gtin);
      CREATE INDEX IF NOT EXISTS idx_catalogo_cum_gtin_log ON catalogo_cum(gtin_empaque_logistico);
      CREATE INDEX IF NOT EXISTS idx_catalogo_cum_gtin_venta ON catalogo_cum(gtin_empaque_venta);
      CREATE INDEX IF NOT EXISTS idx_catalogo_cum_producto ON catalogo_cum(producto);
      CREATE INDEX IF NOT EXISTS idx_catalogo_cum_principio ON catalogo_cum(principio_activo);
      CREATE INDEX IF NOT EXISTS idx_catalogo_cum_registro ON catalogo_cum(registro_sanitario);
      CREATE INDEX IF NOT EXISTS idx_catalogo_cum_fuente ON catalogo_cum(fuente);
      CREATE INDEX IF NOT EXISTS idx_catalogo_cum_estado ON catalogo_cum(estado_cum);
      CREATE INDEX IF NOT EXISTS idx_catalogo_cum_version ON catalogo_cum(version_catalogo);
    `);
  },
  down: async (db: any) => {
    await db.execAsync(`
      DROP INDEX IF EXISTS idx_catalogo_cum_version;
      DROP INDEX IF EXISTS idx_catalogo_cum_estado;
      DROP INDEX IF EXISTS idx_catalogo_cum_fuente;
      DROP INDEX IF EXISTS idx_catalogo_cum_registro;
      DROP INDEX IF EXISTS idx_catalogo_cum_principio;
      DROP INDEX IF EXISTS idx_catalogo_cum_producto;
      DROP INDEX IF EXISTS idx_catalogo_cum_gtin_venta;
      DROP INDEX IF EXISTS idx_catalogo_cum_gtin_log;
      DROP INDEX IF EXISTS idx_catalogo_cum_gtin;
      DROP INDEX IF EXISTS idx_catalogo_cum_cum;
      DROP TABLE IF EXISTS catalogo_cum;
    `);
  },
};

