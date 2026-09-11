function validarLote(data) {
  const errores = [];

  if (!data.medicamento_id) errores.push('El medicamento es obligatorio.');
  if (!data.sede_id) errores.push('La sede es obligatoria.');
  if (!data.numero_lote || !data.numero_lote.trim()) errores.push('El número de lote es obligatorio.');
  if (!data.fecha_expedicion) errores.push('La fecha de expedición es obligatoria.');
  if (!data.fecha_vencimiento) errores.push('La fecha de vencimiento es obligatoria.');

  if (data.fecha_expedicion && data.fecha_vencimiento) {
    if (new Date(data.fecha_vencimiento) <= new Date(data.fecha_expedicion)) {
      errores.push('La fecha de vencimiento debe ser posterior a la fecha de expedición.');
    }
  }

  const cajas = Number(data.cantidad_cajas ?? 0);
  const sueltas = Number(data.cantidad_unidades_sueltas ?? 0);

  if (!Number.isInteger(cajas) || cajas < 0) errores.push('La cantidad de cajas debe ser un entero mayor o igual a 0.');
  if (!Number.isInteger(sueltas) || sueltas < 0) errores.push('La cantidad de unidades sueltas debe ser un entero mayor o igual a 0.');
  if (cajas === 0 && sueltas === 0) errores.push('Debe registrar al menos una caja o una unidad suelta.');

  return { valido: errores.length === 0, errores };
}

module.exports = { validarLote };
