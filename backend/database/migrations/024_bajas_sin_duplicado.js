// Migración 024: integridad de las solicitudes de baja.
//
// Dos problemas que la aplicación sola no puede cerrar:
//
// 1. Duplicidad. `solicitudEliminacionService.crear` inserta sin consultar las
//    solicitudes PENDIENTE del mismo registro, y 006_solicitudes_eliminacion.js
//    solo define índices NO únicos. Dos envíos seguidos (o un reintento tras un
//    error de auditoría) dejan dos solicitudes PENDIENTE del mismo lote, y
//    aprobarlas dos veces no es detectable. La protección va en el motor, no en
//    el servicio: un índice único PARCIAL sobre (tipo_registro, registro_id).
//    `registro_id` es polimórfico —hoy solo LOTE, mañana MEDICAMENTO—, así que
//    la clave incluye el discriminante. La condición `estado = 'PENDIENTE'` deja
//    que una solicitud resuelta libere el par, de modo que una baja legítima
//    posterior del mismo lote no queda bloqueada para siempre.
//
// 2. Trazabilidad de la baja. `lotes` no tiene columna `estado`; el estado
//    mostrado se deriva en `loteService.calcularEstado` de `estado_manual`. No
//    existía dónde registrar por qué ni quién dio de baja el lote. Estas tres
//    columnas son ese rastro y las escribe `marcarLoteDeBaja`.
module.exports = {
  name: '024_bajas_sin_duplicado',
  up(db) {
    // Base existente: puede haber duplicados PENDIENTE previos a esta migración.
    // No se borra nada — se resuelven como RECHAZADA para que ni la solicitud ni
    // su motivo se pierdan del histórico. Se conserva la más antigua de cada par.
    db.exec(`
      UPDATE solicitudes_eliminacion
      SET estado = 'RECHAZADA',
          usuario_resolutor_id = usuario_solicitante_id,
          fecha_resolucion = datetime('now'),
          observacion_resolucion = 'Cerrada automaticamente: existian varias solicitudes PENDIENTE del mismo registro antes de la migracion 024'
      WHERE estado = 'PENDIENTE'
        AND id NOT IN (
          SELECT MIN(id)
          FROM solicitudes_eliminacion
          WHERE estado = 'PENDIENTE'
          GROUP BY tipo_registro, registro_id
        )
    `);

    db.exec(`
      CREATE UNIQUE INDEX IF NOT EXISTS idx_solicitudes_elim_pendiente
        ON solicitudes_eliminacion(tipo_registro, registro_id)
        WHERE estado = 'PENDIENTE'
    `);

    const cols = db.prepare('PRAGMA table_info(lotes)').all().map((c) => c.name);
    if (!cols.includes('baja_motivo')) {
      db.exec('ALTER TABLE lotes ADD COLUMN baja_motivo TEXT');
    }
    if (!cols.includes('baja_usuario_id')) {
      db.exec('ALTER TABLE lotes ADD COLUMN baja_usuario_id INTEGER');
    }
    if (!cols.includes('baja_fecha')) {
      db.exec('ALTER TABLE lotes ADD COLUMN baja_fecha TEXT');
    }
  },
  down(db) {
    db.exec('DROP INDEX IF EXISTS idx_solicitudes_elim_pendiente');
    const cols = db.prepare('PRAGMA table_info(lotes)').all().map((c) => c.name);
    for (const col of ['baja_motivo', 'baja_usuario_id', 'baja_fecha']) {
      if (cols.includes(col)) db.exec(`ALTER TABLE lotes DROP COLUMN ${col}`);
    }
  }
};
