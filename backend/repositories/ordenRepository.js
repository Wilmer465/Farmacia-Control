const { getDb } = require('../database/connection');

function siguienteNumero(db) {
  // SEGURIDAD concurrencia/borrados: MAX del consecutivo en vez de COUNT(*)+1,
  // que repetía números si había borrados. Dentro de la tx de crearConDetalles.
  const row = db.prepare(`
    SELECT MAX(CAST(SUBSTR(numero, 5) AS INTEGER)) AS maximo FROM ordenes
    WHERE numero LIKE 'ORD-%'
  `).get();
  const consecutivo = (Number(row?.maximo) || 0) + 1;
  return `ORD-${String(consecutivo).padStart(6, '0')}`;
}

function sanitizarEntero(valor, defecto, maximo = 500) {
  const n = Number.parseInt(valor, 10);
  if (!Number.isInteger(n) || n < 0) return defecto;
  return Math.min(n, maximo);
}

// Columnas de listado: SIN blobs (firma_data/documento_adjunto_data son base64
// que pueden ser megas por fila). El detalle completo va por findById().
const COLUMNAS_LISTADO = `
  o.id, o.numero, o.sede_id, o.estado, o.motivo_cancelacion,
  o.usuario_creador_id, o.fecha_creacion, o.fecha_actualizacion,
  o.tipo_destino, o.destino_detalle,
  o.receptor_nombre, o.receptor_documento, o.receptor_telefono, o.receptor_correo,
  CASE WHEN o.firma_data IS NOT NULL AND o.firma_data != '' THEN 1 ELSE 0 END AS tiene_firma,
  o.huella_registrada,
  o.documento_adjunto_nombre, o.documento_adjunto_tipo,
  CASE WHEN o.documento_adjunto_data IS NOT NULL AND o.documento_adjunto_data != '' THEN 1 ELSE 0 END AS tiene_adjunto,
  o.documentacion_completa, o.elementos_faltantes
`;

function findAll({ sedeId } = {}) {
  const db = getDb();
  const condiciones = [];
  const params = {};
  if (sedeId !== null && sedeId !== undefined) {
    condiciones.push('o.sede_id = @sedeId');
    params.sedeId = sedeId;
  }
  const where = condiciones.length ? `WHERE ${condiciones.join(' AND ')}` : '';

  return db.prepare(`
    SELECT ${COLUMNAS_LISTADO}, s.nombre AS sede_nombre, u.nombre AS creador_nombre
    FROM ordenes o
    JOIN sedes s ON s.id = o.sede_id
    JOIN usuarios u ON u.id = o.usuario_creador_id
    ${where}
    ORDER BY o.fecha_creacion DESC
  `).all(params);
}

// Listado paginado con COUNT(*) real para totales correctos en la UI.
function findAllPaginated({ sedeId, estado, fechaInicio, fechaFin, limit = 25, offset = 0 } = {}) {  const db = getDb();
  const condiciones = [];
  const params = {};
  if (sedeId !== null && sedeId !== undefined) {
    condiciones.push('o.sede_id = @sedeId');
    params.sedeId = sedeId;
  }
  if (estado) {
    condiciones.push('o.estado = @estado');
    params.estado = estado;
  }
  if (fechaInicio) {
    condiciones.push('o.fecha_creacion >= @fechaInicio');
    params.fechaInicio = fechaInicio;
  }
  if (fechaFin) {
    condiciones.push('o.fecha_creacion <= @fechaFin');
    params.fechaFin = fechaFin;
  }
  const where = condiciones.length ? `WHERE ${condiciones.join(' AND ')}` : '';
  const limpio = sanitizarEntero(limit, 25);
  const desplazamiento = sanitizarEntero(offset, 0, 1000000);

  const total = db.prepare(`
    SELECT COUNT(*) AS total FROM ordenes o ${where}
  `).get(params).total;

  const data = db.prepare(`
    SELECT ${COLUMNAS_LISTADO}, s.nombre AS sede_nombre, u.nombre AS creador_nombre
    FROM ordenes o
    JOIN sedes s ON s.id = o.sede_id
    JOIN usuarios u ON u.id = o.usuario_creador_id
    ${where}
    ORDER BY o.fecha_creacion DESC
    LIMIT ${limpio} OFFSET ${desplazamiento}
  `).all(params);

  return { data, total, limit: limpio, offset: desplazamiento };
}

function contar({ sedeId, estado, estadoNot, documentacionCompleta, excluirTipoDestino, tipoDestinoNot } = {}) {
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
  if (estadoNot) {
    condiciones.push('estado != @estadoNot');
    params.estadoNot = estadoNot;
  }
  if (documentacionCompleta !== undefined) {
    condiciones.push('documentacion_completa = @documentacionCompleta');
    params.documentacionCompleta = documentacionCompleta;
  }
  const tipoExcluir = excluirTipoDestino || tipoDestinoNot;
  if (tipoExcluir) {
    condiciones.push('tipo_destino != @tipoExcluir');
    params.tipoExcluir = tipoExcluir;
  }
  const where = condiciones.length ? `WHERE ${condiciones.join(' AND ')}` : '';
  return db.prepare(`SELECT COUNT(*) AS total FROM ordenes ${where}`).get(params).total;
}

function findById(id) {
  const db = getDb();
  const orden = db.prepare(`
    SELECT o.*, s.nombre AS sede_nombre, u.nombre AS creador_nombre
    FROM ordenes o
    JOIN sedes s ON s.id = o.sede_id
    JOIN usuarios u ON u.id = o.usuario_creador_id
    WHERE o.id = ?
  `).get(id);
  if (!orden) return null;

  const detalles = db.prepare(`
    SELECT od.*, m.nombre AS medicamento_nombre, m.codigo AS medicamento_codigo, m.unidades_por_caja
    FROM orden_detalles od
    JOIN medicamentos m ON m.id = od.medicamento_id
    WHERE od.orden_id = ?
  `).all(id);

  return { ...orden, detalles };
}

// Crea la orden y todas sus líneas en una única transacción: o quedan todas, o ninguna.
function crearConDetalles({
  sede_id, usuario_creador_id, items, tipo_destino = 'LOCAL', destino_detalle = null,
  receptor_nombre = null, receptor_documento = null, receptor_telefono = null, receptor_correo = null,
  firma_data = null, huella_registrada = 0,
  documento_adjunto_nombre = null, documento_adjunto_data = null, documento_adjunto_tipo = null,
  documentacion_completa = 0, elementos_faltantes = null
}) {
  const db = getDb();

  const tx = db.transaction(() => {
    const numero = siguienteNumero(db);

    // Verificar stock disponible para cada medicamento en la sede (atómico, dentro de la tx)
    const checkStock = db.prepare(`
      SELECT COUNT(*) AS cnt FROM lotes
      WHERE medicamento_id = ? AND sede_id = ? AND cantidad_total_unidades > 0
    `);
    for (const item of items) {
      const hayStock = checkStock.get(item.medicamento_id, sede_id);
      if (!hayStock || hayStock.cnt === 0) {
        throw new Error(`STOCK_INSUFICIENTE:${item.medicamento_id}`);
      }
    }

    const infoOrden = db.prepare(`
      INSERT INTO ordenes (
        numero, sede_id, estado, usuario_creador_id, tipo_destino, destino_detalle,
        receptor_nombre, receptor_documento, receptor_telefono, receptor_correo,
        firma_data, huella_registrada,
        documento_adjunto_nombre, documento_adjunto_data, documento_adjunto_tipo,
        documentacion_completa, elementos_faltantes
      )
      VALUES (?, ?, 'PENDIENTE', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      numero, sede_id, usuario_creador_id, tipo_destino, destino_detalle,
      receptor_nombre, receptor_documento, receptor_telefono, receptor_correo,
      firma_data, huella_registrada,
      documento_adjunto_nombre, documento_adjunto_data, documento_adjunto_tipo,
      documentacion_completa, elementos_faltantes
    );

    const ordenId = infoOrden.lastInsertRowid;

    const insertDetalle = db.prepare(`
      INSERT INTO orden_detalles
        (orden_id, medicamento_id, cantidad_cajas_solicitada, cantidad_unidades_solicitada, cantidad_total_solicitada)
      VALUES (@orden_id, @medicamento_id, @cantidad_cajas_solicitada, @cantidad_unidades_solicitada, @cantidad_total_solicitada)
    `);

    for (const item of items) {
      insertDetalle.run({ orden_id: ordenId, ...item });
    }

    return ordenId;
  });

  const ordenId = tx();
  return findById(ordenId);
}

function actualizarEstado(id, nuevoEstado) {
  const db = getDb();
  db.prepare(`
    UPDATE ordenes SET estado = ?, fecha_actualizacion = datetime('now') WHERE id = ?
  `).run(nuevoEstado, id);
  return findById(id);
}

function cancelar(id, motivo) {
  const db = getDb();
  db.prepare(`
    UPDATE ordenes SET estado = 'CANCELADA', motivo_cancelacion = ?, fecha_actualizacion = datetime('now') WHERE id = ?
  `).run(motivo, id);
  return findById(id);
}

// Actualiza la documentación de quien recibe de una orden ya creada
// (permite completar después los datos, firma o huella que quedaron pendientes).
function actualizarDocumentacion(id, {
  receptor_nombre, receptor_documento, receptor_telefono, receptor_correo,
  firma_data, huella_registrada,
  documento_adjunto_nombre, documento_adjunto_data, documento_adjunto_tipo,
  documentacion_completa, elementos_faltantes
} = {}) {
  const db = getDb();
  db.prepare(`
    UPDATE ordenes SET
      receptor_nombre = ?, receptor_documento = ?, receptor_telefono = ?, receptor_correo = ?,
      firma_data = ?, huella_registrada = ?,
      documento_adjunto_nombre = ?, documento_adjunto_data = ?, documento_adjunto_tipo = ?,
      documentacion_completa = ?, elementos_faltantes = ?,
      fecha_actualizacion = datetime('now')
    WHERE id = ?
  `).run(
    receptor_nombre, receptor_documento, receptor_telefono, receptor_correo,
    firma_data, huella_registrada,
    documento_adjunto_nombre, documento_adjunto_data, documento_adjunto_tipo,
    documentacion_completa ? 1 : 0, elementos_faltantes,
    id
  );
  return findById(id);
}

module.exports = { findAll, findAllPaginated, contar, findById, crearConDetalles, actualizarEstado, cancelar, actualizarDocumentacion };
