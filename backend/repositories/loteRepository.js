const { getDb } = require('../database/connection');
const movimientoRepository = require('./movimientoRepository');

// sedeId === null significa "sin filtro" (solo permitido para visión global, ya resuelto en el service).
function sanitizarEntero(valor, defecto, maximo = 500) {
  if (valor === null || valor === undefined || valor === '') return defecto;
  const n = Number.parseInt(valor, 10);
  if (!Number.isInteger(n) || n < 0) return defecto;
  return Math.min(n, maximo);
}

// `incluirDadosDeBaja` (por defecto false) es una condición de OPERABILIDAD, no un
// filtro cosmético: un lote DADO_DE_BAJA con existencias no puede despacharse,
// transferirse ni dispensarse. Los listados de operación —Ordenes, Pacientes,
// intercambios— no lo piden. Solo Inventario lo pide, porque ahí el lote se muestra
// para dejar constancia de la baja, no para moverlo.
function findAll({ sedeId, medicamentoId, limit, offset, incluirDadosDeBaja = false } = {}) {
  const db = getDb();
  const condiciones = [];
  const params = {};

  if (!incluirDadosDeBaja) {
    condiciones.push(`(l.estado_manual IS NULL OR l.estado_manual != 'DADO_DE_BAJA')`);
  }
  if (sedeId !== null && sedeId !== undefined) {
    condiciones.push('l.sede_id = @sedeId');
    params.sedeId = sedeId;
  }
  if (medicamentoId) {
    condiciones.push('l.medicamento_id = @medicamentoId');
    params.medicamentoId = medicamentoId;
  }

  const where = condiciones.length ? `WHERE ${condiciones.join(' AND ')}` : '';
  // SEGURIDAD: LIMIT/OFFSET siempre como enteros sanitizados — nunca interpolar
  // crudo lo que venga del renderer.
  const limpio = sanitizarEntero(limit, null);
  const desplazamiento = sanitizarEntero(offset, null, 1000000);
  const limitClause = limpio !== null ? `LIMIT ${limpio}` : '';
  const offsetClause = desplazamiento !== null ? `OFFSET ${desplazamiento}` : '';

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
  // Las columnas de empaque (021) pueden no existir en BDs viejas sin migrar;
  // se detectan por PRAGMA para no romper el INSERT.
  const cols = new Set(db.prepare('PRAGMA table_info(lotes)').all().map((c) => c.name));
  const extras = [];
  if (cols.has('empaque_nivel')) extras.push('empaque_nivel');
  if (cols.has('empaque_gtin')) extras.push('empaque_gtin');
  if (cols.has('factor_conversion')) extras.push('factor_conversion');
  const columnas = [
    'medicamento_id', 'sede_id', 'numero_lote', 'fecha_expedicion', 'fecha_vencimiento',
    'cantidad_cajas', 'cantidad_unidades_sueltas', 'cantidad_total_unidades',
    ...extras
  ];
  const params = {
    medicamento_id: data.medicamento_id,
    sede_id: data.sede_id,
    numero_lote: data.numero_lote,
    fecha_expedicion: data.fecha_expedicion,
    fecha_vencimiento: data.fecha_vencimiento,
    cantidad_cajas: data.cantidad_cajas,
    cantidad_unidades_sueltas: data.cantidad_unidades_sueltas,
    cantidad_total_unidades: data.cantidad_total_unidades,
    empaque_nivel: data.empaque_nivel ?? null,
    empaque_gtin: data.empaque_gtin ?? null,
    factor_conversion: data.factor_conversion ?? 1
  };
  const stmt = db.prepare(`
    INSERT INTO lotes (${columnas.join(', ')})
    VALUES (${columnas.map((c) => `@${c}`).join(', ')})
  `);
  const info = stmt.run(params);
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

// `lotes` no tiene columna `estado`: el estado mostrado es derivado. `estado_manual`
// es la única marca persistida, y las columnas baja_* (migración 024) son el rastro
// de por qué y quién la aplicó. Se actualizan juntas y NO en su propia transacción:
// las llama `solicitudEliminacionService.resolver` dentro de la que cierra la
// resolución, para que no exista una solicitud aprobada con el lote sin marcar.
function marcarLoteDeBaja(id, { motivo, usuarioId }) {
  const db = getDb();
  db.prepare(`
    UPDATE lotes SET
      estado_manual = 'DADO_DE_BAJA',
      baja_motivo = @motivo,
      baja_usuario_id = @usuarioId,
      baja_fecha = datetime('now'),
      updated_at = datetime('now')
    WHERE id = @id
  `).run({ id, motivo: motivo || null, usuarioId: usuarioId ?? null });
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

// Agregados SQL para dashboard: evita traer todos los lotes y calcular en JS.
function resumenStock({ sedeId } = {}) {
  const db = getDb();
  const condiciones = [];
  const params = {};
  if (sedeId !== null && sedeId !== undefined) {
    condiciones.push('l.sede_id = @sedeId');
    params.sedeId = sedeId;
  }
  const where = condiciones.length ? `WHERE ${condiciones.join(' AND ')}` : '';
  return db.prepare(`
    SELECT
      COUNT(DISTINCT l.medicamento_id) AS total_medicamentos,
      COALESCE(SUM(l.cantidad_total_unidades), 0) AS stock_total_unidades,
      COALESCE(SUM(l.cantidad_cajas), 0) AS cajas_totales,
      COUNT(*) AS total_lotes
    FROM lotes l
    ${where}
  `).get(params);
}

function contar({ sedeId, medicamentoId, incluirDadosDeBaja = false } = {}) {
  const db = getDb();
  const condiciones = [];
  const params = {};
  if (!incluirDadosDeBaja) {
    condiciones.push(`(estado_manual IS NULL OR estado_manual != 'DADO_DE_BAJA')`);
  }
  if (sedeId !== null && sedeId !== undefined) {
    condiciones.push('sede_id = @sedeId');
    params.sedeId = sedeId;
  }
  if (medicamentoId) {
    condiciones.push('medicamento_id = @medicamentoId');
    params.medicamentoId = medicamentoId;
  }
  const where = condiciones.length ? `WHERE ${condiciones.join(' AND ')}` : '';
  return db.prepare(`SELECT COUNT(*) AS total FROM lotes ${where}`).get(params).total;
}

// Conteo de vencidos/próximos en SQL (misma regla que calcularEstado en JS:
// AGOTADO se excluye por stock<=0 o DADO_DE_BAJA; VENCIDO si fecha < hoy;
// PROXIMO si fecha <= hoy+90 días). Evita traer todos los lotes al dashboard.
function resumenVencimientos({ sedeId } = {}) {
  const db = getDb();
  const condiciones = [`(estado_manual IS NULL OR estado_manual != 'DADO_DE_BAJA')`, `cantidad_total_unidades > 0`];
  const params = {};
  if (sedeId !== null && sedeId !== undefined) {
    condiciones.push('sede_id = @sedeId');
    params.sedeId = sedeId;
  }
  const where = `WHERE ${condiciones.join(' AND ')}`;
  return db.prepare(`
    SELECT
      COUNT(CASE WHEN date(fecha_vencimiento) < date('now') THEN 1 END) AS vencidos,
      COUNT(CASE WHEN date(fecha_vencimiento) >= date('now')
                  AND date(fecha_vencimiento) <= date('now', '+90 days') THEN 1 END) AS proximos
    FROM lotes
    ${where}
  `).get(params);
}

module.exports = { findAll, findById, findByClaveUnica, create, crearConMovimiento, updateCantidades, ajustarConMovimiento, setEstadoManual, marcarLoteDeBaja, existeEnSede, resumenStock, contar, resumenVencimientos };

