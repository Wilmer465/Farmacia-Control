module.exports = {
  name: '009_indices_optimizacion',
  up(db) {
    db.exec(`
      CREATE INDEX IF NOT EXISTS idx_mov_inv_fecha_tipo ON movimientos_inventario(fecha, tipo, sede_id);
      CREATE INDEX IF NOT EXISTS idx_mov_inv_med ON movimientos_inventario(medicamento_id);
      CREATE INDEX IF NOT EXISTS idx_mov_inv_orden ON movimientos_inventario(referencia_orden_id);

      CREATE INDEX IF NOT EXISTS idx_lotes_med_sede ON lotes(medicamento_id, sede_id, estado_manual);
      CREATE INDEX IF NOT EXISTS idx_lotes_vencimiento ON lotes(fecha_vencimiento);
      CREATE INDEX IF NOT EXISTS idx_lotes_numero ON lotes(numero_lote);

      CREATE INDEX IF NOT EXISTS idx_ordenes_sede_estado ON ordenes(sede_id, estado, fecha_creacion);
      CREATE INDEX IF NOT EXISTS idx_ordenes_numero ON ordenes(numero);
      CREATE INDEX IF NOT EXISTS idx_orden_detalles_orden ON orden_detalles(orden_id, medicamento_id);

      CREATE INDEX IF NOT EXISTS idx_despachos_orden_fecha ON despachos(orden_id, sede_id, fecha);
      CREATE INDEX IF NOT EXISTS idx_despacho_detalle_despacho ON despacho_detalle(despacho_id, lote_id);

      CREATE INDEX IF NOT EXISTS idx_entregas_orden_doc ON entregas(orden_id, sede_id, documentacion_completa, fecha);
      CREATE INDEX IF NOT EXISTS idx_entregas_despacho ON entregas(despacho_id);

      CREATE INDEX IF NOT EXISTS idx_auditoria_fecha_sede ON auditoria(fecha, sede_id, usuario_id, modulo);
      CREATE INDEX IF NOT EXISTS idx_solicitudes_elim_estado ON solicitudes_eliminacion(sede_id, estado, fecha_solicitud);
    `);
  },
  down(db) {
    db.exec(`
      DROP INDEX IF EXISTS idx_mov_inv_fecha_tipo;
      DROP INDEX IF EXISTS idx_mov_inv_med;
      DROP INDEX IF EXISTS idx_mov_inv_orden;
      DROP INDEX IF EXISTS idx_lotes_med_sede;
      DROP INDEX IF EXISTS idx_lotes_vencimiento;
      DROP INDEX IF EXISTS idx_lotes_numero;
      DROP INDEX IF EXISTS idx_ordenes_sede_estado;
      DROP INDEX IF EXISTS idx_ordenes_numero;
      DROP INDEX IF EXISTS idx_orden_detalles_orden;
      DROP INDEX IF EXISTS idx_despachos_orden_fecha;
      DROP INDEX IF EXISTS idx_despacho_detalle_despacho;
      DROP INDEX IF EXISTS idx_entregas_orden_doc;
      DROP INDEX IF EXISTS idx_entregas_despacho;
      DROP INDEX IF EXISTS idx_auditoria_fecha_sede;
      DROP INDEX IF EXISTS idx_solicitudes_elim_estado;
    `);
  }
};
