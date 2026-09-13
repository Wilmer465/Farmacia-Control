const { getDb } = require('../database/connection');

function findAll({ sedeId, estado } = {}) {
  const db = getDb();
  const condiciones = [];
  const params = {};

  if (sedeId !== null && sedeId !== undefined) {
    condiciones.push('(si.sede_origen_id = @sedeId OR si.sede_destino_id = @sedeId)');
    params.sedeId = sedeId;
  }
  if (estado && estado !== 'TODAS') {
    condiciones.push('si.estado = @estado');
    params.estado = estado;
  }

  const where = condiciones.length ? `WHERE ${condiciones.join(' AND ')}` : '';

  return db.prepare(`
    SELECT si.*,
           s_orig.nombre AS sede_origen_nombre,
           s_dest.nombre AS sede_destino_nombre,
           usol.nombre AS solicitante_nombre,
           ures.nombre AS resolutor_nombre,
           m.nombre AS medicamento_nombre,
           m.codigo AS medicamento_codigo,
           l.numero_lote,
           l.fecha_vencimiento AS lote_fecha_vencimiento,
           l.cantidad_total_unidades AS stock_actual_lote,
           s_rec.nombre AS sede_recibe_nombre,
           m_rec.nombre AS medicamento_recibe_nombre,
           m_rec.codigo AS medicamento_recibe_codigo,
           l_rec.numero_lote AS numero_lote_recibe,
           l_rec.fecha_vencimiento AS lote_recibe_fecha_vencimiento,
           l_rec.cantidad_total_unidades AS stock_actual_lote_recibe
    FROM solicitudes_intercambio si
    JOIN sedes s_orig ON s_orig.id = si.sede_origen_id
    JOIN sedes s_dest ON s_dest.id = si.sede_destino_id
    JOIN usuarios usol ON usol.id = si.usuario_solicitante_id
    LEFT JOIN usuarios ures ON ures.id = si.usuario_resolutor_id
    JOIN medicamentos m ON m.id = si.medicamento_id
    JOIN lotes l ON l.id = si.lote_id
    LEFT JOIN sedes s_rec ON s_rec.id = si.sede_recibe_id
    LEFT JOIN medicamentos m_rec ON m_rec.id = si.medicamento_recibe_id
    LEFT JOIN lotes l_rec ON l_rec.id = si.lote_recibe_id
    ${where}
    ORDER BY si.fecha_solicitud DESC
  `).all(params);
}

function findById(id) {
  const db = getDb();
  return db.prepare(`
    SELECT si.*,
           s_orig.nombre AS sede_origen_nombre,
           s_dest.nombre AS sede_destino_nombre,
           usol.nombre AS solicitante_nombre,
           ures.nombre AS resolutor_nombre,
           m.nombre AS medicamento_nombre,
           m.codigo AS medicamento_codigo,
           l.numero_lote,
           l.fecha_vencimiento AS lote_fecha_vencimiento,
           l.cantidad_total_unidades AS stock_actual_lote,
           s_rec.nombre AS sede_recibe_nombre,
           m_rec.nombre AS medicamento_recibe_nombre,
           m_rec.codigo AS medicamento_recibe_codigo,
           l_rec.numero_lote AS numero_lote_recibe,
           l_rec.fecha_vencimiento AS lote_recibe_fecha_vencimiento,
           l_rec.cantidad_total_unidades AS stock_actual_lote_recibe
    FROM solicitudes_intercambio si
    JOIN sedes s_orig ON s_orig.id = si.sede_origen_id
    JOIN sedes s_dest ON s_dest.id = si.sede_destino_id
    JOIN usuarios usol ON usol.id = si.usuario_solicitante_id
    LEFT JOIN usuarios ures ON ures.id = si.usuario_resolutor_id
    JOIN medicamentos m ON m.id = si.medicamento_id
    JOIN lotes l ON l.id = si.lote_id
    LEFT JOIN sedes s_rec ON s_rec.id = si.sede_recibe_id
    LEFT JOIN medicamentos m_rec ON m_rec.id = si.medicamento_recibe_id
    LEFT JOIN lotes l_rec ON l_rec.id = si.lote_recibe_id
    WHERE si.id = ?
  `).get(id);
}

function create(data) {
  const db = getDb();
  const stmt = db.prepare(`
    INSERT INTO solicitudes_intercambio
      (tipo, sede_origen_id, sede_destino_id, lote_id, medicamento_id,
       cantidad_cajas, cantidad_unidades, cantidad_total_unidades,
       sede_recibe_id, lote_recibe_id, medicamento_recibe_id, cantidad_recibe_total_unidades,
       motivo, usuario_solicitante_id)
    VALUES
      (@tipo, @sede_origen_id, @sede_destino_id, @lote_id, @medicamento_id,
       @cantidad_cajas, @cantidad_unidades, @cantidad_total_unidades,
       @sede_recibe_id, @lote_recibe_id, @medicamento_recibe_id, @cantidad_recibe_total_unidades,
       @motivo, @usuario_solicitante_id)
  `);
  const info = stmt.run(data);
  return findById(info.lastInsertRowid);
}

function resolver(id, { estado, usuario_resolutor_id, observacion_resolucion }) {
  const db = getDb();
  db.prepare(`
    UPDATE solicitudes_intercambio SET
      estado = @estado,
      usuario_resolutor_id = @usuario_resolutor_id,
      observacion_resolucion = @observacion_resolucion,
      fecha_resolucion = datetime('now')
    WHERE id = @id
  `).run({ id, estado, usuario_resolutor_id, observacion_resolucion: observacion_resolucion || null });
  return findById(id);
}

module.exports = { findAll, findById, create, resolver };
