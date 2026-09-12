function validarSolicitudIntercambio(data) {
  const errores = [];
  if (!data.lote_id) errores.push('Debe seleccionar el lote de origen.');
  if (!data.sede_destino_id) errores.push('Debe seleccionar la sede de destino.');
  if (Number(data.sede_origen_id) === Number(data.sede_destino_id)) {
    errores.push('La sede de destino debe ser diferente a la sede de origen.');
  }
  const total = Number(data.cantidad_total_unidades ?? 0);
  if (!Number.isFinite(total) || total <= 0) {
    errores.push('La cantidad total a transferir debe ser mayor a 0.');
  }
  if (!data.motivo || !data.motivo.trim()) {
    errores.push('Debe indicar el motivo o justificación del envío o intercambio.');
  }
  return { valido: errores.length === 0, errores };
}

function validarResolucionIntercambio(data) {
  const errores = [];
  if (!['APROBADA', 'RECHAZADA'].includes(data.decision)) {
    errores.push('La decisión debe ser APROBADA o RECHAZADA.');
  }
  if (data.decision === 'RECHAZADA' && (!data.observacion || !data.observacion.trim())) {
    errores.push('Debe proporcionar un motivo para rechazar la solicitud.');
  }
  return { valido: errores.length === 0, errores };
}

module.exports = { validarSolicitudIntercambio, validarResolucionIntercambio };
