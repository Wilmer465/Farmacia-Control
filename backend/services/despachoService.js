const despachoRepository = require('../repositories/despachoRepository');
const ordenRepository = require('../repositories/ordenRepository');
const loteRepository = require('../repositories/loteRepository');
const auditoriaRepository = require('../repositories/auditoriaRepository');
const permisoService = require('./permisoService');
const { validarItemsDespacho } = require('../validators/despachoValidator');
const { AUDIT_ACTIONS } = require('../../shared/constants');

class ValidationError extends Error {}

const ESTADOS_DESPACHABLES = ['PENDIENTE', 'PARCIAL'];

function listarPorOrden(usuarioSesion, ordenId) {
  const orden = ordenRepository.findById(ordenId);
  if (!orden) throw new ValidationError('La orden no existe.');
  permisoService.verificarPerteneceASede(usuarioSesion, orden.sede_id);

  const despachos = despachoRepository.findAll({ ordenId });
  if (despachos.length === 0) return [];

  // Obtener todos los detalles en una sola query (evita N+1)
  const ids = despachos.map(d => d.id).join(',');
  const detalles = despachoRepository.findDetalleByDespachoIds(ids);
  
  // Agrupar detalles por despacho_id
  const detallesPorDespacho = {};
  for (const d of detalles) {
    if (!detallesPorDespacho[d.despacho_id]) detallesPorDespacho[d.despacho_id] = [];
    detallesPorDespacho[d.despacho_id].push(d);
  }

  return despachos.map(d => ({ ...d, detalle: detallesPorDespacho[d.id] || [] }));
}

function crear(usuarioSesion, { orden_id, items }) {
  permisoService.verificarDespacho(usuarioSesion);

  const orden = ordenRepository.findById(orden_id);
  if (!orden) throw new ValidationError('La orden no existe.');
  permisoService.verificarPerteneceASede(usuarioSesion, orden.sede_id);

  if (!ESTADOS_DESPACHABLES.includes(orden.estado)) {
    throw new ValidationError(`Solo se pueden despachar órdenes PENDIENTE o PARCIAL (actual: ${orden.estado}).`);
  }

  const { valido, errores } = validarItemsDespacho(items);
  if (!valido) throw new ValidationError(errores.join(' '));

  const detallesPorId = new Map(orden.detalles.map((d) => [d.id, d]));

  const itemsPreparados = items.map((item, idx) => {
    const detalleOrden = detallesPorId.get(Number(item.orden_detalle_id));
    if (!detalleOrden) throw new ValidationError(`Línea ${idx + 1}: no pertenece a esta orden.`);

    const lote = loteRepository.findById(item.lote_id);
    if (!lote) throw new ValidationError(`Línea ${idx + 1}: el lote no existe.`);
    if (lote.sede_id !== orden.sede_id) {
      throw new ValidationError(`Línea ${idx + 1}: el lote pertenece a otra sede.`);
    }
    if (lote.medicamento_id !== detalleOrden.medicamento_id) {
      throw new ValidationError(`Línea ${idx + 1}: el lote no corresponde al medicamento de la orden.`);
    }

    const total = Number(item.cantidad_unidades_despachada ?? item.cantidad_total_despachada ?? item.cantidad_unidades_sueltas_despachada ?? (Number(item.cantidad_cajas_despachada || 0) * (lote.unidades_por_caja || 1) + Number(item.cantidad_unidades_sueltas_despachada || 0)));
    const cajas = 0;
    const sueltas = total;

    return {
      orden_detalle_id: detalleOrden.id,
      lote_id: lote.id,
      medicamento_id: detalleOrden.medicamento_id,
      cantidad_cajas_despachada: cajas,
      cantidad_unidades_sueltas_despachada: sueltas,
      cantidad_total_despachada: total
    };
  });

  let resultado;
  try {
    resultado = despachoRepository.crearConDetalles({
      orden_id: orden.id,
      sede_id: orden.sede_id,
      despachado_por: usuarioSesion.id,
      items: itemsPreparados
    });
  } catch (err) {
    // Errores lanzados dentro de la transacción (stock insuficiente, lote vencido, etc).
    throw new ValidationError(err.message);
  }

  auditoriaRepository.registrar({
    usuario_id: usuarioSesion.id,
    rol: usuarioSesion.rol_nombre,
    sede_id: orden.sede_id,
    accion: AUDIT_ACTIONS.DESPACHAR_MEDICAMENTO,
    modulo: 'DESPACHOS',
    registro_afectado: `orden:${orden.id}`,
    resultado: 'EXITO',
    valores_nuevos: {
      despacho_id: resultado.despacho.id,
      items: itemsPreparados,
      nuevo_estado_orden: resultado.nuevoEstadoOrden
    }
  });

  return resultado;
}

module.exports = { listarPorOrden, crear, ValidationError };
