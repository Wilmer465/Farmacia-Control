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
  return db.prepare(`
    SELECT * FROM receptores
    ORDER BY
      CASE prioridad
        WHEN 'ALTA' THEN 1
        WHEN 'MEDIA' THEN 2
        WHEN 'BAJA' THEN 3
        ELSE 4
      END,
      nombre ASC
  `).all();
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
  documento_adjunto_tipo = null,
  prioridad = undefined,
  medicamentos_uso = undefined,
  notas = undefined
}) {
  if (!documento || !documento.trim() || !nombre || !nombre.trim()) return null;
  const db = getDb();
  const docLimpio = documento.trim();
  const nombreLimpio = nombre.trim();

  const existente = buscarPorDocumento(docLimpio);

  if (existente) {
    // Si no se envia un nuevo valor para campos opcionales, se conserva el existente
    const telefonoFinal = telefono !== undefined && telefono !== null ? telefono : existente.telefono;
    const correoFinal = correo_electronico !== undefined && correo_electronico !== null ? correo_electronico : existente.correo_electronico;
    const firmaFinal = firma_guardada !== undefined ? firma_guardada : existente.firma_guardada;
    const huellaFinal = huella_guardada !== undefined ? (huella_guardada ? 1 : 0) : existente.huella_guardada;
    const adjuntoNombreFinal = documento_adjunto_nombre !== undefined ? documento_adjunto_nombre : existente.documento_adjunto_nombre;
    const adjuntoDataFinal = documento_adjunto_data !== undefined ? documento_adjunto_data : existente.documento_adjunto_data;
    const adjuntoTipoFinal = documento_adjunto_tipo !== undefined ? documento_adjunto_tipo : existente.documento_adjunto_tipo;
    const prioridadFinal = normalizarPrioridad(prioridad !== undefined ? prioridad : existente.prioridad);
    const medicamentosFinal = medicamentos_uso !== undefined ? prepararMedicamentos(medicamentos_uso) : existente.medicamentos_uso;
    const notasFinal = notas !== undefined ? limpiarTextoOpcional(notas) : existente.notas;

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
        prioridad = ?,
        medicamentos_uso = ?,
        notas = ?,
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
      prioridadFinal,
      medicamentosFinal,
      notasFinal,
      existente.id
    );

    return buscarPorDocumento(docLimpio);
  }

  const info = db.prepare(`
    INSERT INTO receptores
      (documento, nombre, telefono, correo_electronico, firma_guardada, huella_guardada,
       documento_adjunto_nombre, documento_adjunto_data, documento_adjunto_tipo,
       prioridad, medicamentos_uso, notas)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    docLimpio,
    nombreLimpio,
    telefono,
    correo_electronico,
    firma_guardada,
    huella_guardada ? 1 : 0,
    documento_adjunto_nombre,
    documento_adjunto_data,
    documento_adjunto_tipo,
    normalizarPrioridad(prioridad),
    prepararMedicamentos(medicamentos_uso),
    limpiarTextoOpcional(notas)
  );

  return db.prepare(`SELECT * FROM receptores WHERE id = ?`).get(info.lastInsertRowid);
}

function actualizar(id, datos) {
  const db = getDb();
  const existente = db.prepare('SELECT * FROM receptores WHERE id = ?').get(id);
  if (!existente) return null;

  const documento = limpiarTextoOpcional(datos.documento ?? existente.documento);
  const nombre = limpiarTextoOpcional(datos.nombre ?? existente.nombre);
  if (!documento || !nombre) return null;

  const duplicado = buscarPorDocumento(documento);
  if (duplicado && duplicado.id !== existente.id) {
    throw new Error('Ya existe otra persona registrada con ese documento.');
  }

  db.prepare(`
    UPDATE receptores SET
      documento = ?,
      nombre = ?,
      telefono = ?,
      correo_electronico = ?,
      firma_guardada = ?,
      huella_guardada = ?,
      documento_adjunto_nombre = ?,
      documento_adjunto_data = ?,
      documento_adjunto_tipo = ?,
      prioridad = ?,
      medicamentos_uso = ?,
      notas = ?,
      updated_at = datetime('now')
    WHERE id = ?
  `).run(
    documento,
    nombre,
    datos.telefono !== undefined ? limpiarTextoOpcional(datos.telefono) : existente.telefono,
    datos.correo_electronico !== undefined ? limpiarTextoOpcional(datos.correo_electronico) : existente.correo_electronico,
    datos.firma_guardada !== undefined ? datos.firma_guardada : existente.firma_guardada,
    datos.huella_guardada !== undefined ? (datos.huella_guardada ? 1 : 0) : existente.huella_guardada,
    datos.documento_adjunto_nombre !== undefined ? datos.documento_adjunto_nombre : existente.documento_adjunto_nombre,
    datos.documento_adjunto_data !== undefined ? datos.documento_adjunto_data : existente.documento_adjunto_data,
    datos.documento_adjunto_tipo !== undefined ? datos.documento_adjunto_tipo : existente.documento_adjunto_tipo,
    normalizarPrioridad(datos.prioridad !== undefined ? datos.prioridad : existente.prioridad),
    datos.medicamentos_uso !== undefined ? prepararMedicamentos(datos.medicamentos_uso) : existente.medicamentos_uso,
    datos.notas !== undefined ? limpiarTextoOpcional(datos.notas) : existente.notas,
    existente.id
  );

  return db.prepare('SELECT * FROM receptores WHERE id = ?').get(existente.id);
}

function normalizarPrioridad(valor) {
  const prioridad = String(valor || 'MEDIA').trim().toUpperCase();
  return ['ALTA', 'MEDIA', 'BAJA'].includes(prioridad) ? prioridad : 'MEDIA';
}

function limpiarTextoOpcional(valor) {
  if (valor === undefined) return undefined;
  if (valor === null) return null;
  const limpio = String(valor).trim();
  return limpio || null;
}

function prepararMedicamentos(valor) {
  if (valor === undefined) return undefined;
  if (valor === null) return null;
  if (Array.isArray(valor)) {
    const meds = valor
      .map((m) => {
        if (m && typeof m === 'object') return m;
        const nombre = String(m || '').trim();
        return nombre ? { nombre } : null;
      })
      .filter(Boolean);
    return meds.length ? JSON.stringify(meds) : null;
  }
  const limpio = String(valor).trim();
  if (!limpio) return null;
  try {
    const parsed = JSON.parse(limpio);
    if (Array.isArray(parsed)) return JSON.stringify(parsed.map((m) => String(m || '').trim()).filter(Boolean));
  } catch (_) {
    // Si llega texto libre, se conserva como linea simple dentro del JSON.
  }
  return JSON.stringify(limpio.split(/\r?\n|,/).map((m) => m.trim()).filter(Boolean));
}

module.exports = {
  buscarPorDocumento,
  listar,
  guardarOActualizar,
  actualizar
};
