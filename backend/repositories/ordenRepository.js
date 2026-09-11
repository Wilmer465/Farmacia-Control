const { getDb } = require('../database/connection');

function siguienteNumero(db) {
  const row = db.prepare(`SELECT COUNT(*) AS total FROM ordenes`).get();
  const consecutivo = row.total + 1;
  return `ORD-${String(consecutivo).padStart(6, '0')}`;
}

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
    SELECT o.*, s.nombre AS sede_nombre, u.nombre AS creador_nombre
    FROM ordenes o
    JOIN sedes s ON s.id = o.sede_id
    JOIN usuarios u ON u.id = o.usuario_creador_id
    ${where}
    ORDER BY o.fecha_creacion DESC
  `).all(params);
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

module.exports = { findAll, findById, crearConDetalles, actualizarEstado, cancelar, actualizarDocumentacion };
