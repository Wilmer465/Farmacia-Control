const { getDb } = require('../database/connection');

function findAll({ sedeId } = {}) {
  const db = getDb();
  const condiciones = [];
  const params = {};
  if (sedeId !== null && sedeId !== undefined) {
    condiciones.push('e.sede_id = @sedeId');
    params.sedeId = sedeId;
  }
  const where = condiciones.length ? `WHERE ${condiciones.join(' AND ')}` : '';

  return db.prepare(`
    SELECT e.*, o.numero AS orden_numero, o.tipo_destino AS orden_tipo_destino, o.destino_detalle AS orden_destino_detalle,
           s.nombre AS sede_nombre, u.nombre AS entregado_por_nombre
    FROM entregas e
    JOIN ordenes o ON o.id = e.orden_id
    JOIN sedes s ON s.id = e.sede_id
    JOIN usuarios u ON u.id = e.entregado_por
    ${where}
    ORDER BY e.fecha DESC
  `).all(params);
}

function findByDespachoId(despachoId) {
  const db = getDb();
  return db.prepare('SELECT * FROM entregas WHERE despacho_id = ?').get(despachoId);
}

function create(data) {
  const db = getDb();
  const stmt = db.prepare(`
    INSERT INTO entregas
      (despacho_id, orden_id, sede_id, receptor_nombre, receptor_documento,
       firma_data, huella_registrada, entregado_por, documentacion_completa, elementos_faltantes,
       tipo_destino, destino_detalle, documento_adjunto_nombre, documento_adjunto_data, documento_adjunto_tipo)
    VALUES
      (@despacho_id, @orden_id, @sede_id, @receptor_nombre, @receptor_documento,
       @firma_data, @huella_registrada, @entregado_por, @documentacion_completa, @elementos_faltantes,
       @tipo_destino, @destino_detalle, @documento_adjunto_nombre, @documento_adjunto_data, @documento_adjunto_tipo)
  `);
  const info = stmt.run({
    tipo_destino: 'LOCAL',
    destino_detalle: null,
    documento_adjunto_nombre: null,
    documento_adjunto_data: null,
    documento_adjunto_tipo: null,
    ...data
  });
  return db.prepare('SELECT * FROM entregas WHERE id = ?').get(info.lastInsertRowid);
}

module.exports = { findAll, findByDespachoId, create };
