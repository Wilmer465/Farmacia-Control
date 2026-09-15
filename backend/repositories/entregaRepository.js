const { getDb } = require('../database/connection');

function sanitizarEntero(valor, defecto, maximo = 500) {
  const n = Number.parseInt(valor, 10);
  if (!Number.isInteger(n) || n < 0) return defecto;
  return Math.min(n, maximo);
}

// Listado SIN blobs: firma_data y documento_adjunto_data (base64) no viajan en
// listados — solo flags tiene_firma/tiene_adjunto. El blob completo va por
// findByDespachoId/findById cuando la UI lo necesita.
const COLUMNAS_LISTADO = `
  e.id, e.despacho_id, e.orden_id, e.sede_id,
  e.receptor_nombre, e.receptor_documento,
  CASE WHEN COALESCE(e.firma_data, r.firma_guardada) IS NOT NULL
        AND COALESCE(e.firma_data, r.firma_guardada) != '' THEN 1 ELSE 0 END AS tiene_firma,
  e.huella_registrada, e.entregado_por, e.fecha,
  e.documentacion_completa, e.elementos_faltantes,
  e.tipo_destino, e.destino_detalle,
  COALESCE(e.documento_adjunto_nombre, r.documento_adjunto_nombre) AS documento_adjunto_nombre,
  COALESCE(e.documento_adjunto_tipo, r.documento_adjunto_tipo) AS documento_adjunto_tipo,
  CASE WHEN COALESCE(e.documento_adjunto_data, r.documento_adjunto_data) IS NOT NULL
        AND COALESCE(e.documento_adjunto_data, r.documento_adjunto_data) != '' THEN 1 ELSE 0 END AS tiene_adjunto
`;

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
    SELECT ${COLUMNAS_LISTADO},
           o.numero AS orden_numero, o.tipo_destino AS orden_tipo_destino, o.destino_detalle AS orden_destino_detalle,
           s.nombre AS sede_nombre, u.nombre AS entregado_por_nombre
    FROM entregas e
    JOIN ordenes o ON o.id = e.orden_id
    JOIN sedes s ON s.id = e.sede_id
    JOIN usuarios u ON u.id = e.entregado_por
    LEFT JOIN receptores r ON r.documento = e.receptor_documento
    ${where}
    ORDER BY e.fecha DESC
  `).all(params);
}

function findAllPaginated({ sedeId, limit = 25, offset = 0 } = {}) {
  const db = getDb();
  const condiciones = [];
  const params = {};
  if (sedeId !== null && sedeId !== undefined) {
    condiciones.push('e.sede_id = @sedeId');
    params.sedeId = sedeId;
  }
  const where = condiciones.length ? `WHERE ${condiciones.join(' AND ')}` : '';
  const limpio = sanitizarEntero(limit, 25);
  const desplazamiento = sanitizarEntero(offset, 0, 1000000);

  const total = db.prepare(`
    SELECT COUNT(*) AS total FROM entregas e ${where}
  `).get(params).total;

  const data = db.prepare(`
    SELECT ${COLUMNAS_LISTADO},
           o.numero AS orden_numero, o.tipo_destino AS orden_tipo_destino, o.destino_detalle AS orden_destino_detalle,
           s.nombre AS sede_nombre, u.nombre AS entregado_por_nombre
    FROM entregas e
    JOIN ordenes o ON o.id = e.orden_id
    JOIN sedes s ON s.id = e.sede_id
    JOIN usuarios u ON u.id = e.entregado_por
    LEFT JOIN receptores r ON r.documento = e.receptor_documento
    ${where}
    ORDER BY e.fecha DESC
    LIMIT ${limpio} OFFSET ${desplazamiento}
  `).all(params);

  return { data, total, limit: limpio, offset: desplazamiento };
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

module.exports = { findAll, findAllPaginated, findByDespachoId, create };
