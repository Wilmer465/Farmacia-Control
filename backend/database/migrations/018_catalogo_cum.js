// Migración 018: Catálogo maestro CUM (INVIMA) - separado del inventario local
module.exports = {
  name: '018_catalogo_cum',
  up(db) {
    db.exec(`
      CREATE TABLE catalogo_cum (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        -- Identificadores INVIMA
        expediente INTEGER NOT NULL,
        consecutivocum INTEGER NOT NULL,
        cum TEXT NOT NULL UNIQUE,                    -- "expediente-consecutivocum"
        -- Datos del medicamento
        producto TEXT NOT NULL,                      -- Nombre comercial
        descripcioncomercial TEXT,                   -- Descripción completa
        principio_activo TEXT,
        concentracion TEXT,
        forma_farmaceutica TEXT,
        via_administracion TEXT,
        unidad_medida TEXT,
        cantidad_presentacion REAL,                  -- cantidadcum
        -- Identificadores regulatorios
        registro_sanitario TEXT,
        fecha_expedicion_registro TEXT,
        fecha_vencimiento_registro TEXT,
        estado_registro TEXT,                        -- VIGENTE, VENCIDO, etc.
        estado_cum TEXT,                             -- ACTIVO, INACTIVO, HISTORICO
        fecha_activo TEXT,
        fecha_inactivo TEXT,
        -- Trazabilidad
        titular TEXT,                                -- Titular registro sanitario
        laboratorio TEXT,                            -- Laboratorio/fabricante
        fabricante TEXT,
        pais_fabricante TEXT,
        condicion_venta TEXT,                        -- LIBRE, BAJO RECETA, etc.
        tipo_producto TEXT,                          -- MEDICAMENTO, PRODUCTO_BIOLOGICO, etc.
        atc_codigo TEXT,
        atc_descripcion TEXT,
        -- GTIN/Código de barras (enriquecimiento posterior)
        gtin TEXT,                                   -- EAN-13/EAN-14/UPC principal
        gtin_empaque_logistico TEXT,                 -- GTIN caja mayor (nivel 1)
        gtin_empaque_venta TEXT,                     -- GTIN caja individual (nivel 2)
        -- Control de versión
        fuente TEXT NOT NULL DEFAULT 'INVIMA',       -- INVIMA | MANUAL
        version_catalogo TEXT NOT NULL,              -- ej: "2026-08-16"
        fecha_importacion TEXT NOT NULL DEFAULT (datetime('now')),
        hash_fila TEXT,                              -- SHA256 para detectar cambios
        -- Auditoría
        creado_en TEXT NOT NULL DEFAULT (datetime('now')),
        actualizado_en TEXT NOT NULL DEFAULT (datetime('now'))
      );

      CREATE INDEX idx_catalogo_cum_cum ON catalogo_cum(cum);
      CREATE INDEX idx_catalogo_cum_gtin ON catalogo_cum(gtin);
      CREATE INDEX idx_catalogo_cum_gtin_log ON catalogo_cum(gtin_empaque_logistico);
      CREATE INDEX idx_catalogo_cum_gtin_venta ON catalogo_cum(gtin_empaque_venta);
      CREATE INDEX idx_catalogo_cum_producto ON catalogo_cum(producto);
      CREATE INDEX idx_catalogo_cum_principio ON catalogo_cum(principio_activo);
      CREATE INDEX idx_catalogo_cum_registro ON catalogo_cum(registro_sanitario);
      CREATE INDEX idx_catalogo_cum_fuente ON catalogo_cum(fuente);
      CREATE INDEX idx_catalogo_cum_estado ON catalogo_cum(estado_cum);
      CREATE INDEX idx_catalogo_cum_version ON catalogo_cum(version_catalogo);
    `);
  },
  down(db) {
    db.exec(`
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
  }
};