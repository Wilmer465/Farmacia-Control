function validarItemsOrden(items) {
  const errores = [];

  if (!Array.isArray(items) || items.length === 0) {
    errores.push('La orden debe tener al menos un medicamento.');
    return { valido: false, errores };
  }

  items.forEach((item, idx) => {
    if (!item.medicamento_id) errores.push(`Línea ${idx + 1}: falta el medicamento.`);

    const cajas = Number(item.cantidad_cajas_solicitada ?? 0);
    const sueltas = Number(item.cantidad_unidades_solicitada ?? 0);

    if (!Number.isInteger(cajas) || cajas < 0) errores.push(`Línea ${idx + 1}: cajas inválidas.`);
    if (!Number.isInteger(sueltas) || sueltas < 0) errores.push(`Línea ${idx + 1}: unidades sueltas inválidas.`);
    if (cajas === 0 && sueltas === 0) errores.push(`Línea ${idx + 1}: debe solicitar al menos una caja o unidad.`);
  });

  return { valido: errores.length === 0, errores };
}

module.exports = { validarItemsOrden };
