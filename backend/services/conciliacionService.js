const movimientoRepository = require('../repositories/movimientoRepository');
const loteRepository = require('../repositories/loteRepository');
const { getDb } = require('../database/connection');
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

// Versión ligera para dashboard: solo estadoGeneral en SQL, sin traer detalle.
// Misma regla dura: cualquier diferencia o ajuste a la baja => NO_CONCILIADO.
function conciliarResumen(usuarioSesion, { sedeId } = {}) {
  const sedeEfectiva = permisoService.resolverSedeEfectiva(usuarioSesion, sedeId);
  const db = getDb();
  const params = {};
  let filtroLote = '';
  let filtroMov = '';
  if (sedeEfectiva !== null && sedeEfectiva !== undefined) {
    filtroLote = 'AND l.sede_id = @sedeId';
    filtroMov = 'AND m.sede_id = @sedeId';
    params.sedeId = sedeEfectiva;
  }
  const row = db.prepare(`
    SELECT COUNT(*) AS malos FROM (
      SELECT l.id
      FROM lotes l
      LEFT JOIN (
        SELECT lote_id,
               COALESCE(SUM(cantidad), 0) AS esperado,
               COUNT(CASE WHEN tipo = 'AJUSTE' AND cantidad < 0 THEN 1 END) AS bajas
        FROM movimientos_inventario m
        WHERE 1=1 ${filtroMov}
        GROUP BY lote_id
      ) mv ON mv.lote_id = l.id
      WHERE 1=1 ${filtroLote}
        AND (
          l.cantidad_total_unidades != COALESCE(mv.esperado, 0)
          OR COALESCE(mv.bajas, 0) > 0
        )
      LIMIT 1
    )
  `).get(params);
  return { estadoGeneral: (row?.malos || 0) > 0 ? 'NO_CONCILIADO' : 'CONCILIADO' };
}

module.exports = { conciliar, conciliarResumen };
