// Migración 002: catálogo de medicamentos y lotes (existencias por sede).
module.exports = {
  name: '002_inventario',
  up(db) {
    db.exec(`
      CREATE TABLE medicamentos (
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
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      );

      CREATE TABLE lotes (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        medicamento_id INTEGER NOT NULL,
        sede_id INTEGER NOT NULL,
        numero_lote TEXT NOT NULL,
        fecha_expedicion TEXT NOT NULL,
        fecha_vencimiento TEXT NOT NULL,
        cantidad_cajas INTEGER NOT NULL DEFAULT 0,
        cantidad_unidades_sueltas INTEGER NOT NULL DEFAULT 0,
        cantidad_total_unidades INTEGER NOT NULL DEFAULT 0,
        estado_manual TEXT,                 -- NULL salvo bloqueo manual explícito (BLOQUEADO)
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now')),
        FOREIGN KEY (medicamento_id) REFERENCES medicamentos(id),
        FOREIGN KEY (sede_id) REFERENCES sedes(id),
        UNIQUE (medicamento_id, sede_id, numero_lote),
        CHECK (cantidad_cajas >= 0),
        CHECK (cantidad_unidades_sueltas >= 0)
      );

      CREATE INDEX idx_lotes_medicamento ON lotes(medicamento_id);
      CREATE INDEX idx_lotes_sede ON lotes(sede_id);
      CREATE INDEX idx_lotes_vencimiento ON lotes(fecha_vencimiento);
    `);
  }
};
