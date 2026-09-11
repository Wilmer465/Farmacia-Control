function validarItemsDespacho(items) {
  const errores = [];

  if (!Array.isArray(items) || items.length === 0) {
    errores.push('Debe despachar al menos un medicamento.');
    return { valido: false, errores };
  }

  items.forEach((item, idx) => {
    if (!item.orden_detalle_id) errores.push(`Línea ${idx + 1}: falta la referencia a la línea de la orden.`);
    if (!item.lote_id) errores.push(`Línea ${idx + 1}: debe seleccionar un lote.`);

    const cajas = Number(item.cantidad_cajas_despachada ?? 0);
    const sueltas = Number(item.cantidad_unidades_sueltas_despachada ?? 0);

    if (!Number.isInteger(cajas) || cajas < 0) errores.push(`Línea ${idx + 1}: cajas inválidas.`);
    if (!Number.isInteger(sueltas) || sueltas < 0) errores.push(`Línea ${idx + 1}: unidades sueltas inválidas.`);
    if (cajas === 0 && sueltas === 0) errores.push(`Línea ${idx + 1}: debe despachar al menos una caja o unidad.`);
  });

  return { valido: errores.length === 0, errores };
}

module.exports = { validarItemsDespacho };
