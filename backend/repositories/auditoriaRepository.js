const { getDb } = require('../database/connection');

function registrar({ usuario_id, rol, sede_id, accion, modulo, registro_afectado, resultado, valores_anteriores, valores_nuevos }) {
  const db = getDb();
  db.prepare(`
    INSERT INTO auditoria
      (usuario_id, rol, sede_id, accion, modulo, registro_afectado, resultado, valores_anteriores, valores_nuevos)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    usuario_id ?? null,
    rol ?? null,
    sede_id ?? null,
    accion,
    modulo,
    registro_afectado ?? null,
    resultado,
    valores_anteriores ? JSON.stringify(valores_anteriores) : null,
    valores_nuevos ? JSON.stringify(valores_nuevos) : null
  );
}

function findAll({ sedeId, modulo, fechaInicio, fechaFin, limite } = {}) {
  const db = getDb();
  const condiciones = [];
  const params = {};

  if (sedeId !== null && sedeId !== undefined) {
    condiciones.push('a.sede_id = @sedeId');
    params.sedeId = sedeId;
  }
  if (modulo) {
    condiciones.push('a.modulo = @modulo');
    params.modulo = modulo;
  }
  if (fechaInicio) {
    condiciones.push("a.fecha >= @fechaInicio");
    params.fechaInicio = fechaInicio;
  }
  if (fechaFin) {
    condiciones.push("a.fecha <= @fechaFin");
    params.fechaFin = fechaFin;
  }

  const where = condiciones.length ? `WHERE ${condiciones.join(' AND ')}` : '';
  const limitClause = `LIMIT ${Number.isInteger(limite) ? limite : 500}`;

  return db.prepare(`
    SELECT a.*, u.nombre AS usuario_nombre, s.nombre AS sede_nombre
    FROM auditoria a
    LEFT JOIN usuarios u ON u.id = a.usuario_id
    LEFT JOIN sedes s ON s.id = a.sede_id
    ${where}
    ORDER BY a.fecha DESC
    ${limitClause}
  `).all(params);
}

module.exports = { registrar, findAll };
