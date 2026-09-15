const { getDb } = require('../database/connection');

function findAll({ sedeId, estado } = {}) {
  const db = getDb();
  const condiciones = [];
  const params = {};

  if (sedeId !== null && sedeId !== undefined) {
    condiciones.push('se.sede_id = @sedeId');
    params.sedeId = sedeId;
  }
  if (estado) {
    condiciones.push('se.estado = @estado');
    params.estado = estado;
  }

  const where = condiciones.length ? `WHERE ${condiciones.join(' AND ')}` : '';

  return db.prepare(`
    SELECT se.*, s.nombre AS sede_nombre,
           usol.nombre AS solicitante_nombre,
           ures.nombre AS resolutor_nombre,
           m.nombre AS medicamento_nombre, m.codigo AS medicamento_codigo,
           l.numero_lote, l.cantidad_total_unidades AS lote_cantidad
    FROM solicitudes_eliminacion se
    JOIN sedes s ON s.id = se.sede_id
    JOIN usuarios usol ON usol.id = se.usuario_solicitante_id
    LEFT JOIN usuarios ures ON ures.id = se.usuario_resolutor_id
    LEFT JOIN medicamentos m ON m.id = se.medicamento_id
    LEFT JOIN lotes l ON l.id = se.registro_id AND se.tipo_registro = 'LOTE'
    ${where}
    ORDER BY se.fecha_solicitud DESC
  `).all(params);
}

function findById(id) {
  const db = getDb();
  return db.prepare(`
    SELECT se.*, s.nombre AS sede_nombre, usol.nombre AS solicitante_nombre
    FROM solicitudes_eliminacion se
    JOIN sedes s ON s.id = se.sede_id
    JOIN usuarios usol ON usol.id = se.usuario_solicitante_id
    WHERE se.id = ?
  `).get(id);
}

function create(data) {
  const db = getDb();
  const stmt = db.prepare(`
    INSERT INTO solicitudes_eliminacion
      (sede_id, usuario_solicitante_id, tipo_registro, registro_id, medicamento_id, motivo)
    VALUES (@sede_id, @usuario_solicitante_id, @tipo_registro, @registro_id, @medicamento_id, @motivo)
  `);
  const info = stmt.run(data);
  return findById(info.lastInsertRowid);
}

function resolver(id, { estado, usuario_resolutor_id, observacion_resolucion }) {
  const db = getDb();
  db.prepare(`
    UPDATE solicitudes_eliminacion SET
      estado = @estado,
      usuario_resolutor_id = @usuario_resolutor_id,
      observacion_resolucion = @observacion_resolucion,
      fecha_resolucion = datetime('now')
    WHERE id = @id
  `).run({ id, estado, usuario_resolutor_id, observacion_resolucion: observacion_resolucion || null });
  return findById(id);
}

function contar({ sedeId, estado } = {}) {
  const db = getDb();
  const condiciones = [];
  const params = {};
  if (sedeId !== null && sedeId !== undefined) {
    condiciones.push('sede_id = @sedeId');
    params.sedeId = sedeId;
  }
  if (estado) {
    condiciones.push('estado = @estado');
    params.estado = estado;
  }
  const where = condiciones.length ? `WHERE ${condiciones.join(' AND ')}` : '';
  return db.prepare(`SELECT COUNT(*) AS total FROM solicitudes_eliminacion ${where}`).get(params).total;
}

module.exports = { findAll, findById, create, resolver, contar };
