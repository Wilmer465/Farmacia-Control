import { Migration } from '../SQLiteService';

export const migration002: Migration = {
  version: 2,
  name: '002_inventario',
  up: async (db: any) => {
    await db.execAsync(`
      CREATE TABLE IF NOT EXISTS medicamentos (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        codigo TEXT NOT NULL UNIQUE,
        nombre TEXT NOT NULL,
        principio_activo TEXT,
        presentacion TEXT,
        concentracion TEXT,
        laboratorio TEXT,
        unidad_medida TEXT NOT NULL DEFAULT 'TABLETA',
        unidades_por_caja INTEGER NOT NULL DEFAULT 1,
        estado TEXT NOT NULL DEFAULT 'ACTIVO',
        catalogo_cum_id INTEGER,
        fuente TEXT NOT NULL DEFAULT 'MANUAL',
        gtin_principal TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      );

      CREATE TABLE IF NOT EXISTS lotes (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        medicamento_id INTEGER NOT NULL,
        sede_id INTEGER NOT NULL,
        numero_lote TEXT NOT NULL,
        fecha_expedicion TEXT NOT NULL,
        fecha_vencimiento TEXT NOT NULL,
        cantidad_cajas INTEGER NOT NULL DEFAULT 0,
        cantidad_unidades_sueltas INTEGER NOT NULL DEFAULT 0,
        cantidad_total_unidades INTEGER NOT NULL DEFAULT 0,
        estado_manual TEXT,
        empaque_nivel INTEGER CHECK (empaque_nivel IN (1,2,3)),
        empaque_gtin TEXT,
        factor_conversion INTEGER NOT NULL DEFAULT 1,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now')),
        FOREIGN KEY (medicamento_id) REFERENCES medicamentos(id),
        FOREIGN KEY (sede_id) REFERENCES sedes(id),
        UNIQUE (medicamento_id, sede_id, numero_lote),
        CHECK (cantidad_cajas >= 0),
        CHECK (cantidad_unidades_sueltas >= 0)
      );

      CREATE INDEX IF NOT EXISTS idx_lotes_medicamento ON lotes(medicamento_id);
      CREATE INDEX IF NOT EXISTS idx_lotes_sede ON lotes(sede_id);
      CREATE INDEX IF NOT EXISTS idx_lotes_vencimiento ON lotes(fecha_vencimiento);
      CREATE INDEX IF NOT EXISTS idx_medicamentos_codigo ON medicamentos(codigo);
      CREATE INDEX IF NOT EXISTS idx_medicamentos_cum ON medicamentos(catalogo_cum_id);
      CREATE INDEX IF NOT EXISTS idx_medicamentos_gtin ON medicamentos(gtin_principal);
    `);
  },
};

