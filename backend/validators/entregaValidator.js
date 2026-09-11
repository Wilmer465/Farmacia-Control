function validarEntrega(data) {
  const errores = [];
  if (!data.despacho_id) errores.push('Falta la referencia al despacho.');
  // No se exige receptor/firma/huella aquí: la sección 16 dice que la entrega
  // se registra igual aunque falte algo, solo queda marcada como incompleta.
  return { valido: errores.length === 0, errores };
}

module.exports = { validarEntrega };
