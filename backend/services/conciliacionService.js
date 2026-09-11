const movimientoRepository = require('../repositories/movimientoRepository');
const loteRepository = require('../repositories/loteRepository');
const permisoService = require('./permisoService');

// Concilia el inventario de una sede (o todas, si sedeId es null y el usuario tiene
// visión global). Regla dura de la sección 20: si existe algún ajuste a la baja sin
// respaldo de una orden, el sistema NUNCA debe mostrar CONCILIADO, aunque los números
// cuadren matemáticamente — un ajuste a la baja es, en este sistema, lo más parecido
// a una "salida sin orden": alguien movió inventario fuera del flujo normal de despacho.
function conciliar(usuarioSesion, { sedeId } = {}) {
  const sedeEfectiva = permisoService.resolverSedeEfectiva(usuarioSesion, sedeId);

  const lotes = loteRepository.findAll({ sedeId: sedeEfectiva });
  const resumenes = movimientoRepository.resumenPorLote({ sedeId: sedeEfectiva });
  const resumenPorLoteId = new Map(resumenes.map((r) => [r.lote_id, r]));

  const detalle = lotes.map((lote) => {
    const resumen = resumenPorLoteId.get(lote.id) || {
      total_entradas: 0, total_salidas: 0, total_ajustes: 0, ajustes_a_la_baja: 0, stock_esperado: 0
    };
    const stockEsperado = resumen.stock_esperado || 0;
    const stockReal = lote.cantidad_total_unidades;
    const diferencia = stockReal - stockEsperado;
    const tieneAjustesIrregulares = (resumen.ajustes_a_la_baja || 0) > 0;

    let estado;
    if (diferencia !== 0) estado = 'NO_CONCILIADO';
    else if (tieneAjustesIrregulares) estado = 'NO_CONCILIADO';
    else estado = 'CONCILIADO';

    return {
      lote_id: lote.id,
      medicamento_nombre: lote.medicamento_nombre,
      medicamento_codigo: lote.medicamento_codigo,
      numero_lote: lote.numero_lote,
      sede_nombre: lote.sede_nombre,
      total_entradas: resumen.total_entradas || 0,
      total_salidas: Math.abs(resumen.total_salidas || 0),
      total_ajustes: resumen.total_ajustes || 0,
      stock_esperado: stockEsperado,
      stock_real: stockReal,
      diferencia,
      tiene_ajustes_irregulares: tieneAjustesIrregulares,
      estado
    };
  });

  const estadoGeneral = detalle.some((d) => d.estado === 'NO_CONCILIADO') ? 'NO_CONCILIADO' : 'CONCILIADO';

  return { estadoGeneral, detalle };
}

module.exports = { conciliar };
