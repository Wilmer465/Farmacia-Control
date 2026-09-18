// Migración 021: Extender tablas de inventario con referencia a catálogo CUM y empaques
module.exports = {
  name: '021_extender_inventario_cum',
  up(db) {
    // Extender medicamentos: referencia a catálogo CUM, fuente, GTIN principal
    const colsMed = db.prepare("PRAGMA table_info(medicamentos)").all().map(c => c.name);
    
    if (!colsMed.includes('catalogo_cum_id')) {
      db.exec(`ALTER TABLE medicamentos ADD COLUMN catalogo_cum_id INTEGER;`);
    }
    if (!colsMed.includes('fuente')) {
      db.exec(`ALTER TABLE medicamentos ADD COLUMN fuente TEXT NOT NULL DEFAULT 'MANUAL';`); // INVIMA | MANUAL
    }
    if (!colsMed.includes('gtin_principal')) {
      db.exec(`ALTER TABLE medicamentos ADD COLUMN gtin_principal TEXT;`);
    }
    
    // Extender lotes: nivel de empaque, GTIN del empaque, factor conversión
    const colsLotes = db.prepare("PRAGMA table_info(lotes)").all().map(c => c.name);
    
    if (!colsLotes.includes('empaque_nivel')) {
      db.exec(`ALTER TABLE lotes ADD COLUMN empaque_nivel INTEGER CHECK (empaque_nivel IN (1,2,3));`);
    }
    if (!colsLotes.includes('empaque_gtin')) {
      db.exec(`ALTER TABLE lotes ADD COLUMN empaque_gtin TEXT;`);
    }
    if (!colsLotes.includes('factor_conversion')) {
      db.exec(`ALTER TABLE lotes ADD COLUMN factor_conversion INTEGER NOT NULL DEFAULT 1;`);
    }
    
    // Extender movimientos_inventario: trazabilidad de empaque y unidades base
    const colsMov = db.prepare("PRAGMA table_info(movimientos_inventario)").all().map(c => c.name);
    
    if (!colsMov.includes('empaque_nivel')) {
      db.exec(`ALTER TABLE movimientos_inventario ADD COLUMN empaque_nivel INTEGER;`);
    }
    if (!colsMov.includes('cantidad_unidades_base')) {
      db.exec(`ALTER TABLE movimientos_inventario ADD COLUMN cantidad_unidades_base INTEGER;`);
    }
    
    // Índices para búsquedas frecuentes
    db.exec(`
      CREATE INDEX IF NOT EXISTS idx_medicamentos_cum ON medicamentos(catalogo_cum_id);
      CREATE INDEX IF NOT EXISTS idx_medicamentos_fuente ON medicamentos(fuente);
      CREATE INDEX IF NOT EXISTS idx_medicamentos_gtin ON medicamentos(gtin_principal);
      CREATE INDEX IF NOT EXISTS idx_lotes_empaque_nivel ON lotes(empaque_nivel);
      CREATE INDEX IF NOT EXISTS idx_lotes_empaque_gtin ON lotes(empaque_gtin);
      CREATE INDEX IF NOT EXISTS idx_movimientos_empaque ON movimientos_inventario(empaque_nivel);
    `);
  },
  down(db) {
    db.exec(`
      DROP INDEX IF EXISTS idx_movimientos_empaque;
      DROP INDEX IF EXISTS idx_lotes_empaque_gtin;
      DROP INDEX IF EXISTS idx_lotes_empaque_nivel;
      DROP INDEX IF EXISTS idx_medicamentos_gtin;
      DROP INDEX IF EXISTS idx_medicamentos_fuente;
      DROP INDEX IF EXISTS idx_medicamentos_cum;
    `);
    // SQLite no soporta DROP COLUMN directo, se requiere recrear tabla
    // Las columnas se mantienen por compatibilidad hacia atrás
  }
};