import { Migration } from '../SQLiteService';

export const migration021: Migration = {
  version: 21,
  name: '021_extender_inventario_cum',
  up: async (db: any) => {
    const colsMedResult = await db.getAllAsync("PRAGMA table_info(medicamentos)");
    const colsMed = colsMedResult.map((c: any) => c.name);
    
    if (!colsMed.includes('catalogo_cum_id')) {
      await db.execAsync(`ALTER TABLE medicamentos ADD COLUMN catalogo_cum_id INTEGER;`);
    }
    if (!colsMed.includes('fuente')) {
      await db.execAsync(`ALTER TABLE medicamentos ADD COLUMN fuente TEXT NOT NULL DEFAULT 'MANUAL';`);
    }
    if (!colsMed.includes('gtin_principal')) {
      await db.execAsync(`ALTER TABLE medicamentos ADD COLUMN gtin_principal TEXT;`);
    }
    
    const colsLotesResult = await db.getAllAsync("PRAGMA table_info(lotes)");
    const colsLotes = colsLotesResult.map((c: any) => c.name);
    
    if (!colsLotes.includes('empaque_nivel')) {
      await db.execAsync(`ALTER TABLE lotes ADD COLUMN empaque_nivel INTEGER CHECK (empaque_nivel IN (1,2,3));`);
    }
    if (!colsLotes.includes('empaque_gtin')) {
      await db.execAsync(`ALTER TABLE lotes ADD COLUMN empaque_gtin TEXT;`);
    }
    if (!colsLotes.includes('factor_conversion')) {
      await db.execAsync(`ALTER TABLE lotes ADD COLUMN factor_conversion INTEGER NOT NULL DEFAULT 1;`);
    }
    
    const colsMovResult = await db.getAllAsync("PRAGMA table_info(movimientos_inventario)");
    const colsMov = colsMovResult.map((c: any) => c.name);
    
    if (!colsMov.includes('empaque_nivel')) {
      await db.execAsync(`ALTER TABLE movimientos_inventario ADD COLUMN empaque_nivel INTEGER;`);
    }
    if (!colsMov.includes('cantidad_unidades_base')) {
      await db.execAsync(`ALTER TABLE movimientos_inventario ADD COLUMN cantidad_unidades_base INTEGER;`);
    }
    
    await db.execAsync(`
      CREATE INDEX IF NOT EXISTS idx_medicamentos_cum ON medicamentos(catalogo_cum_id);
      CREATE INDEX IF NOT EXISTS idx_medicamentos_fuente ON medicamentos(fuente);
      CREATE INDEX IF NOT EXISTS idx_medicamentos_gtin ON medicamentos(gtin_principal);
      CREATE INDEX IF NOT EXISTS idx_lotes_empaque_nivel ON lotes(empaque_nivel);
      CREATE INDEX IF NOT EXISTS idx_lotes_empaque_gtin ON lotes(empaque_gtin);
      CREATE INDEX IF NOT EXISTS idx_movimientos_empaque ON movimientos_inventario(empaque_nivel);
    `);
  },
  down: async (db: any) => {
    await db.execAsync(`
      DROP INDEX IF EXISTS idx_movimientos_empaque;
      DROP INDEX IF EXISTS idx_lotes_empaque_gtin;
      DROP INDEX IF EXISTS idx_lotes_empaque_nivel;
      DROP INDEX IF EXISTS idx_medicamentos_gtin;
      DROP INDEX IF EXISTS idx_medicamentos_fuente;
      DROP INDEX IF EXISTS idx_medicamentos_cum;
    `);
  },
};

