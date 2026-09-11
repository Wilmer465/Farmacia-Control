// Migración 007: libro de movimientos de inventario. Sin esto, "conciliar" solo
// compararía el stock actual contra sí mismo. Cada entrada, salida por despacho y
// ajuste manual queda aquí, permitiendo recalcular el stock esperado de verdad.
module.exports = {
  name: '007_movimientos_inventario',
  up(db) {
    db.exec(`
      CREATE TABLE movimientos_inventario (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        lote_id INTEGER NOT NULL,
        medicamento_id INTEGER NOT NULL,
        sede_id INTEGER NOT NULL,
        tipo TEXT NOT NULL,             -- ENTRADA | SALIDA_ORDEN | AJUSTE
        cantidad INTEGER NOT NULL,      -- positivo = entrada, negativo = salida/ajuste a la baja
        referencia_orden_id INTEGER,
        usuario_id INTEGER,
        fecha TEXT NOT NULL DEFAULT (datetime('now')),
        FOREIGN KEY (lote_id) REFERENCES lotes(id),
        FOREIGN KEY (medicamento_id) REFERENCES medicamentos(id),
        FOREIGN KEY (sede_id) REFERENCES sedes(id),
        FOREIGN KEY (referencia_orden_id) REFERENCES ordenes(id),
        FOREIGN KEY (usuario_id) REFERENCES usuarios(id)
      );

      CREATE INDEX idx_movimientos_lote ON movimientos_inventario(lote_id);
      CREATE INDEX idx_movimientos_sede ON movimientos_inventario(sede_id);
      CREATE INDEX idx_movimientos_fecha ON movimientos_inventario(fecha);
    `);
  }
};
