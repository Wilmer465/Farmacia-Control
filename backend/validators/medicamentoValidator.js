function validarMedicamento(data) {
  const errores = [];

  if (!data.codigo || !data.codigo.trim()) errores.push('El código es obligatorio.');
  if (!data.nombre || !data.nombre.trim()) errores.push('El nombre es obligatorio.');
  if (!data.unidad_medida || !data.unidad_medida.trim()) errores.push('La unidad de medida es obligatoria.');

  const unidadesPorCaja = Number(data.unidades_por_caja);
  if (!Number.isInteger(unidadesPorCaja) || unidadesPorCaja < 1) {
    errores.push('Unidades por caja debe ser un entero mayor o igual a 1.');
  }

  return { valido: errores.length === 0, errores };
}

module.exports = { validarMedicamento };
