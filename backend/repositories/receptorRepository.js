const { getDb } = require('../database/connection');

function buscarPorDocumento(documento) {
  if (!documento || !documento.trim()) return null;
  const db = getDb();
  return db.prepare(`
    SELECT * FROM receptores
    WHERE LOWER(TRIM(documento)) = LOWER(TRIM(?))
  `).get(documento.trim());
}

function listar() {
  const db = getDb();
  return db.prepare(`SELECT * FROM receptores ORDER BY nombre ASC`).all();
}

function guardarOActualizar({
  documento,
  nombre,
  telefono = null,
  correo_electronico = null,
  firma_guardada = null,
  huella_guardada = 0,
  documento_adjunto_nombre = null,
  documento_adjunto_data = null,
  documento_adjunto_tipo = null
}) {
  if (!documento || !documento.trim() || !nombre || !nombre.trim()) return null;
  const db = getDb();
  const docLimpio = documento.trim();
  const nombreLimpio = nombre.trim();

  const existente = buscarPorDocumento(docLimpio);

  if (existente) {
    // Si no se envia un nuevo valor para campos opcionales, se conserva el existente
    const telefonoFinal = telefono !== undefined && telefono !== null ? telefono : existente.telefono;
    const firmaFinal = firma_guardada !== undefined ? firma_guardada : existente.firma_guardada;
    const huellaFinal = huella_guardada !== undefined ? (huella_guardada ? 1 : 0) : existente.huella_guardada;
    const adjuntoNombreFinal = documento_adjunto_nombre !== undefined ? documento_adjunto_nombre : existente.documento_adjunto_nombre;
    const adjuntoDataFinal = documento_adjunto_data !== undefined ? documento_adjunto_data : existente.documento_adjunto_data;
    const adjuntoTipoFinal = documento_adjunto_tipo !== undefined ? documento_adjunto_tipo : existente.documento_adjunto_tipo;

    db.prepare(`
      UPDATE receptores SET
        nombre = ?,
        telefono = ?,
        correo_electronico = ?,
        firma_guardada = ?,
        huella_guardada = ?,
        documento_adjunto_nombre = ?,
        documento_adjunto_data = ?,
        documento_adjunto_tipo = ?,
        updated_at = datetime('now')
      WHERE id = ?
    `).run(
      nombreLimpio,
      telefonoFinal,
      correoFinal,
      firmaFinal,
      huellaFinal ? 1 : 0,
      adjuntoNombreFinal,
      adjuntoDataFinal,
      adjuntoTipoFinal,
      existente.id
    );

    return buscarPorDocumento(docLimpio);
  }

  const info = db.prepare(`
    INSERT INTO receptores
      (documento, nombre, telefono, correo_electronico, firma_guardada, huella_guardada,
       documento_adjunto_nombre, documento_adjunto_data, documento_adjunto_tipo)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    docLimpio,
    nombreLimpio,
    telefono,
    correo_electronico,
    firma_guardada,
    huella_guardada ? 1 : 0,
    documento_adjunto_nombre,
    documento_adjunto_data,
    documento_adjunto_tipo
  );

  return db.prepare(`SELECT * FROM receptores WHERE id = ?`).get(info.lastInsertRowid);
}

module.exports = {
  buscarPorDocumento,
  listar,
  guardarOActualizar
};
