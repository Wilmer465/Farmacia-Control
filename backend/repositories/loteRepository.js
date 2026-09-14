const { getDb } = require('../database/connection');
const movimientoRepository = require('./movimientoRepository');

// sedeId === null significa "sin filtro" (solo permitido para visión global, ya resuelto en el service).
function findAll({ sedeId, medicamentoId, limit, offset } = {}) {
  const db = getDb();
  const condiciones = [];
  const params = {};

  if (sedeId !== null && sedeId !== undefined) {
    condiciones.push('l.sede_id = @sedeId');
    params.sedeId = sedeId;
  }
  if (medicamentoId) {
    condiciones.push('l.medicamento_id = @medicamentoId');
    params.medicamentoId = medicamentoId;
  }

  const where = condiciones.length ? `WHERE ${condiciones.join(' AND ')}` : '';
  const limitClause = limit ? `LIMIT ${limit}` : '';
  const offsetClause = offset ? `OFFSET ${offset}` : '';

  return db.prepare(`
    SELECT l.*, m.nombre AS medicamento_nombre, m.codigo AS medicamento_codigo,
           m.unidades_por_caja, s.nombre AS sede_nombre
    FROM lotes l
    JOIN medicamentos m ON m.id = l.medicamento_id
    JOIN sedes s ON s.id = l.sede_id
    ${where}
    ORDER BY l.fecha_vencimiento ASC
    ${limitClause} ${offsetClause}
  `).all(params);
}

function findById(id) {
  const db = getDb();
  return db.prepare(`
    SELECT l.*, m.nombre AS medicamento_nombre, m.unidades_por_caja, s.nombre AS sede_nombre
    FROM lotes l
    JOIN medicamentos m ON m.id = l.medicamento_id
    JOIN sedes s ON s.id = l.sede_id
    WHERE l.id = ?
  `).get(id);
}

function findByClaveUnica(medicamentoId, sedeId, numeroLote) {
  const db = getDb();
  return db.prepare(`
    SELECT * FROM lotes WHERE medicamento_id = ? AND sede_id = ? AND numero_lote = ?
  `).get(medicamentoId, sedeId, numeroLote);
}

function create(data) {
  const db = getDb();
  const stmt = db.prepare(`
    INSERT INTO lotes
      (medicamento_id, sede_id, numero_lote, fecha_expedicion, fecha_vencimiento,
       cantidad_cajas, cantidad_unidades_sueltas, cantidad_total_unidades)
    VALUES
      (@medicamento_id, @sede_id, @numero_lote, @fecha_expedicion, @fecha_vencimiento,
       @cantidad_cajas, @cantidad_unidades_sueltas, @cantidad_total_unidades)
  `);
  const info = stmt.run(data);
  return findById(info.lastInsertRowid);
}

// Crea el lote y registra su movimiento de ENTRADA en una sola transacción —
// nunca puede existir un lote sin el rastro de entrada que lo originó (sección 30).
// Incluye verificación de unicidad atómica para evitar race conditions.
function crearConMovimiento(data, usuarioId) {
  const db = getDb();
  const tx = db.transaction(() => {
    const existente = db.prepare(`
      SELECT 1 FROM lotes WHERE medicamento_id = ? AND sede_id = ? AND numero_lote = ?
    `).get(data.medicamento_id, data.sede_id, data.numero_lote);
    if (existente) {
      throw new Error('DUPLICATE_LOTE');
    }
    const lote = create(data);
    movimientoRepository.registrar({
      lote_id: lote.id,
      medicamento_id: lote.medicamento_id,
      sede_id: lote.sede_id,
      tipo: 'ENTRADA',
      cantidad: lote.cantidad_total_unidades,
      usuario_id: usuarioId
    });
    return lote;
  });
  return tx();
}

function updateCantidades(id, { cantidad_cajas, cantidad_unidades_sueltas, cantidad_total_unidades }) {
  const db = getDb();
  db.prepare(`
    UPDATE lotes SET
      cantidad_cajas = ?,
      cantidad_unidades_sueltas = ?,
      cantidad_total_unidades = ?,
      updated_at = datetime('now')
    WHERE id = ?
  `).run(cantidad_cajas, cantidad_unidades_sueltas, cantidad_total_unidades, id);
  return findById(id);
}

// Ajusta cantidades y registra el movimiento de AJUSTE (positivo o negativo según
// suba o baje el conteo) en una sola transacción.
function ajustarConMovimiento(id, nuevasCantidades, usuarioId) {
  const db = getDb();
  const tx = db.transaction(() => {
    const anterior = findById(id);
    const actualizado = updateCantidades(id, nuevasCantidades);
    const delta = actualizado.cantidad_total_unidades - anterior.cantidad_total_unidades;
    if (delta !== 0) {
      movimientoRepository.registrar({
        lote_id: id,
        medicamento_id: actualizado.medicamento_id,
        sede_id: actualizado.sede_id,
        tipo: 'AJUSTE',
        cantidad: delta,
        usuario_id: usuarioId
      });
    }
    return actualizado;
  });
  return tx();
}

const ESTADOS_MANUALES_VALIDOS = ['DADO_DE_BAJA'];

function setEstadoManual(id, estadoManual) {
  if (!ESTADOS_MANUALES_VALIDOS.includes(estadoManual)) {
    throw new Error(`Estado manual inválido: ${estadoManual}. Valores permitidos: ${ESTADOS_MANUALES_VALIDOS.join(', ')}`);
  }
  const db = getDb();
  db.prepare(`UPDATE lotes SET estado_manual = ?, updated_at = datetime('now') WHERE id = ?`)
    .run(estadoManual, id);
  return findById(id);
}

// Verifica que un medicamento tenga al menos un lote con stock > 0 en una sede específica.
function existeEnSede(medicamentoId, sedeId) {
  const db = getDb();
  const row = db.prepare(`
    SELECT COUNT(*) AS cnt FROM lotes
    WHERE medicamento_id = ? AND sede_id = ? AND cantidad_total_unidades > 0
  `).get(medicamentoId, sedeId);
  return row.cnt > 0;
}

module.exports = { findAll, findById, findByClaveUnica, create, crearConMovimiento, updateCantidades, ajustarConMovimiento, setEstadoManual, existeEnSede };

