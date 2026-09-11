const { getDb } = require('../database/connection');
const movimientoRepository = require('./movimientoRepository');

function findAll({ sedeId, ordenId } = {}) {
  const db = getDb();
  const condiciones = [];
  const params = {};
  if (sedeId !== null && sedeId !== undefined) {
    condiciones.push('d.sede_id = @sedeId');
    params.sedeId = sedeId;
  }
  if (ordenId) {
    condiciones.push('d.orden_id = @ordenId');
    params.ordenId = ordenId;
  }
  const where = condiciones.length ? `WHERE ${condiciones.join(' AND ')}` : '';

  return db.prepare(`
    SELECT d.*, o.numero AS orden_numero, s.nombre AS sede_nombre, u.nombre AS despachador_nombre
    FROM despachos d
    JOIN ordenes o ON o.id = d.orden_id
    JOIN sedes s ON s.id = d.sede_id
    JOIN usuarios u ON u.id = d.despachado_por
    ${where}
    ORDER BY d.fecha DESC
  `).all(params);
}

function findById(id) {
  const db = getDb();
  return db.prepare(`
    SELECT d.*, o.numero AS orden_numero, s.nombre AS sede_nombre, u.nombre AS despachador_nombre
    FROM despachos d
    JOIN ordenes o ON o.id = d.orden_id
    JOIN sedes s ON s.id = d.sede_id
    JOIN usuarios u ON u.id = d.despachado_por
    WHERE d.id = ?
  `).get(id);
}

function findDetalleByDespachoId(despachoId) {
  const db = getDb();
  return db.prepare(`
    SELECT dd.*, m.nombre AS medicamento_nombre, m.codigo AS medicamento_codigo, l.numero_lote
    FROM despacho_detalle dd
    JOIN medicamentos m ON m.id = dd.medicamento_id
    JOIN lotes l ON l.id = dd.lote_id
    WHERE dd.despacho_id = ?
  `).all(despachoId);
}

// Ejecuta TODO el despacho en una única transacción SQLite:
// 1) valida (en frío, dentro de la tx, para evitar condiciones de carrera) que cada
//    lote tenga stock suficiente y no esté vencido/bloqueado,
// 2) descuenta el lote,
// 3) acumula lo despachado en la línea de la orden,
// 4) recalcula y actualiza el estado de la orden,
// 5) inserta el despacho y su detalle.
// Si cualquier paso falla, SQLite revierte todo — no puede quedar inventario
// parcialmente descontado ni una orden en un estado inconsistente.
function crearConDetalles({ orden_id, sede_id, despachado_por, items }) {
  const db = getDb();

  const tx = db.transaction(() => {
    const infoDespacho = db.prepare(`
      INSERT INTO despachos (orden_id, sede_id, despachado_por) VALUES (?, ?, ?)
    `).run(orden_id, sede_id, despachado_por);
    const despachoId = infoDespacho.lastInsertRowid;

    const insertDetalle = db.prepare(`
      INSERT INTO despacho_detalle
        (despacho_id, orden_detalle_id, lote_id, medicamento_id,
         cantidad_cajas_despachada, cantidad_unidades_sueltas_despachada, cantidad_total_despachada)
      VALUES (@despacho_id, @orden_detalle_id, @lote_id, @medicamento_id,
              @cantidad_cajas_despachada, @cantidad_unidades_sueltas_despachada, @cantidad_total_despachada)
    `);

    const getLoteLock = db.prepare(`
      SELECT l.*, m.unidades_por_caja
      FROM lotes l
      JOIN medicamentos m ON m.id = l.medicamento_id
      WHERE l.id = ?
    `);
    const updateLote = db.prepare(`
      UPDATE lotes SET cantidad_cajas = ?, cantidad_unidades_sueltas = ?, cantidad_total_unidades = ?, updated_at = datetime('now')
      WHERE id = ?
    `);
    const getDetalleLock = db.prepare('SELECT * FROM orden_detalles WHERE id = ?');
    const updateDetalleDespachado = db.prepare(`
      UPDATE orden_detalles SET cantidad_total_despachada = ? WHERE id = ?
    `);

    for (const item of items) {
      const lote = getLoteLock.get(item.lote_id);
      if (!lote) throw new Error('El lote seleccionado ya no existe.');
      if (lote.sede_id !== sede_id) {
        throw new Error(`El lote ${lote.numero_lote} pertenece a otra sede y no puede despacharse en esta orden.`);
      }
      if (lote.estado_manual === 'DADO_DE_BAJA' || lote.estado_manual === 'BLOQUEADO') {
        throw new Error(`El lote ${lote.numero_lote} fue dado de baja y no puede despacharse.`);
      }

      const hoy = new Date(); hoy.setHours(0, 0, 0, 0);
      if (new Date(lote.fecha_vencimiento) < hoy) {
        throw new Error(`El lote ${lote.numero_lote} está vencido y no puede despacharse.`);
      }
      if (lote.cantidad_total_unidades < item.cantidad_total_despachada) {
        throw new Error(`Stock insuficiente en el lote ${lote.numero_lote}.`);
      }

      const detalleOrden = getDetalleLock.get(item.orden_detalle_id);
      if (!detalleOrden) throw new Error('La línea de orden ya no existe.');
      const pendiente = detalleOrden.cantidad_total_solicitada - detalleOrden.cantidad_total_despachada;
      if (item.cantidad_total_despachada > pendiente) {
        throw new Error(`Está despachando más de lo pendiente para ese medicamento (pendiente: ${pendiente}).`);
      }

      // Descontar del lote: se resta unidades totales, reconvirtiendo a cajas/sueltas
      // usando el mismo criterio de equivalencia del medicamento (evita inconsistencias
      // si el usuario despacha una mezcla de cajas y sueltas que no calzan exacto).
      const unidadesPorCaja = lote.unidades_por_caja || 1;
      const nuevoTotalLote = lote.cantidad_total_unidades - item.cantidad_total_despachada;
      const nuevasCajas = Math.floor(nuevoTotalLote / unidadesPorCaja);
      const nuevasSueltas = nuevoTotalLote % unidadesPorCaja;
      updateLote.run(nuevasCajas, nuevasSueltas, nuevoTotalLote, lote.id);

      updateDetalleDespachado.run(detalleOrden.cantidad_total_despachada + item.cantidad_total_despachada, detalleOrden.id);

      insertDetalle.run({
        despacho_id: despachoId,
        orden_detalle_id: item.orden_detalle_id,
        lote_id: item.lote_id,
        medicamento_id: item.medicamento_id,
        cantidad_cajas_despachada: item.cantidad_cajas_despachada,
        cantidad_unidades_sueltas_despachada: item.cantidad_unidades_sueltas_despachada,
        cantidad_total_despachada: item.cantidad_total_despachada
      });

      movimientoRepository.registrar({
        lote_id: item.lote_id,
        medicamento_id: item.medicamento_id,
        sede_id,
        tipo: 'SALIDA_ORDEN',
        cantidad: -item.cantidad_total_despachada, // negativo: es una salida
        referencia_orden_id: orden_id,
        usuario_id: despachado_por
      });
    }

    // Recalcular estado de la orden a partir de TODAS sus líneas, no solo las tocadas ahora.
    const lineas = db.prepare('SELECT cantidad_total_solicitada, cantidad_total_despachada FROM orden_detalles WHERE orden_id = ?').all(orden_id);
    const totalSolicitado = lineas.reduce((acc, l) => acc + l.cantidad_total_solicitada, 0);
    const totalDespachado = lineas.reduce((acc, l) => acc + l.cantidad_total_despachada, 0);

    let nuevoEstado;
    if (totalDespachado >= totalSolicitado) nuevoEstado = 'COMPLETADA';
    else if (totalDespachado > 0) nuevoEstado = 'PARCIAL';
    else nuevoEstado = 'PENDIENTE'; // no debería pasar dentro de esta transacción, pero por seguridad

    db.prepare(`UPDATE ordenes SET estado = ?, fecha_actualizacion = datetime('now') WHERE id = ?`).run(nuevoEstado, orden_id);

    return { despachoId, nuevoEstado };
  });

  const resultado = tx();
  return {
    despacho: findById(resultado.despachoId),
    detalle: findDetalleByDespachoId(resultado.despachoId),
    nuevoEstadoOrden: resultado.nuevoEstado
  };
}

module.exports = { findAll, findById, findDetalleByDespachoId, crearConDetalles };
