function validarSolicitud(data) {
  const errores = [];
  if (!data.registro_id) errores.push('Falta indicar el registro a eliminar.');
  if (!data.motivo || !data.motivo.trim()) errores.push('Debe indicar el motivo de la solicitud.');
  return { valido: errores.length === 0, errores };
}

function validarResolucion(data) {
  const errores = [];
  if (!['APROBADA', 'RECHAZADA'].includes(data.decision)) {
    errores.push('La decisión debe ser APROBADA o RECHAZADA.');
  }
  return { valido: errores.length === 0, errores };
}

module.exports = { validarSolicitud, validarResolucion };
