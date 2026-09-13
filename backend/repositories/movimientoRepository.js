const { getDb } = require('../database/connection');

function registrar({ lote_id, medicamento_id, sede_id, tipo, cantidad, referencia_orden_id, usuario_id }) {
  const db = getDb();
  db.prepare(`
    INSERT INTO movimientos_inventario
      (lote_id, medicamento_id, sede_id, tipo, cantidad, referencia_orden_id, usuario_id)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(lote_id, medicamento_id, sede_id, tipo, cantidad, referencia_orden_id ?? null, usuario_id ?? null);
}

// Suma de movimientos por lote, agrupado por tipo. Es la base de la conciliación:
// el "stock esperado" de un lote es la suma de TODOS sus movimientos (las entradas
// ya son positivas, las salidas/ajustes negativos).
function resumenPorLote({ sedeId, hasta } = {}) {
  const db = getDb();
  const condiciones = ['1=1'];
  const params = {};
  if (sedeId !== null && sedeId !== undefined) {
    condiciones.push('m.sede_id = @sedeId');
    params.sedeId = sedeId;
  }
  if (hasta) {
    condiciones.push('m.fecha <= @hasta');
    params.hasta = hasta;
  }

  return db.prepare(`
    SELECT
      m.lote_id,
      SUM(CASE WHEN m.tipo IN ('ENTRADA', 'TRASLADO_ENTRADA') THEN m.cantidad ELSE 0 END) AS total_entradas,
      SUM(CASE WHEN m.tipo IN ('SALIDA_ORDEN', 'TRASLADO_SALIDA') THEN m.cantidad ELSE 0 END) AS total_salidas,
      SUM(CASE WHEN m.tipo = 'AJUSTE' THEN m.cantidad ELSE 0 END) AS total_ajustes,
      SUM(CASE WHEN m.tipo = 'AJUSTE' AND m.cantidad < 0 THEN 1 ELSE 0 END) AS ajustes_a_la_baja,
      SUM(m.cantidad) AS stock_esperado
    FROM movimientos_inventario m
    WHERE ${condiciones.join(' AND ')}
    GROUP BY m.lote_id
  `).all(params);
}

function findByRango({ sedeId, fechaInicio, fechaFin, tipo } = {}) {
  const db = getDb();
  const condiciones = [];
  const params = {};
  if (sedeId !== null && sedeId !== undefined) {
    condiciones.push('m.sede_id = @sedeId');
    params.sedeId = sedeId;
  }
  if (fechaInicio) { condiciones.push('m.fecha >= @fechaInicio'); params.fechaInicio = fechaInicio; }
  if (fechaFin) { condiciones.push('m.fecha <= @fechaFin'); params.fechaFin = fechaFin; }
  if (tipo) { condiciones.push('m.tipo = @tipo'); params.tipo = tipo; }

  const where = condiciones.length ? `WHERE ${condiciones.join(' AND ')}` : '';

  return db.prepare(`
    SELECT m.*, med.nombre AS medicamento_nombre, med.codigo AS medicamento_codigo,
           l.numero_lote, l.fecha_expedicion, l.fecha_vencimiento, s.nombre AS sede_nombre, u.nombre AS usuario_nombre,
           o.numero AS orden_numero
    FROM movimientos_inventario m
    JOIN medicamentos med ON med.id = m.medicamento_id
    JOIN lotes l ON l.id = m.lote_id
    JOIN sedes s ON s.id = m.sede_id
    LEFT JOIN usuarios u ON u.id = m.usuario_id
    LEFT JOIN ordenes o ON o.id = m.referencia_orden_id
    ${where}
    ORDER BY m.fecha ASC
  `).all(params);
}

module.exports = { registrar, resumenPorLote, findByRango };
